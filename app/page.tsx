"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Item = { id:string; kind:"image"|"pdf"; file:File; name:string; thumb:string; page?:number; pdf?:PDFDocumentProxy };
type Result = { name:string; blob:Blob; url:string; width:number; height:number; count:number };
const MAX_FILE=200*1024*1024, MAX_PIXELS=150_000_000, MAX_SIDE=32000;
class TooLarge extends Error {}

async function pdfLib(){
  // 互換版を使うと、少し古いiPhone/AndroidでもPDF.jsが動作します。
  const lib=await import("pdfjs-dist/legacy/build/pdf.mjs");
  // ワーカーも互換版を同梱し、外部CDNへは接続しません。
  lib.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).toString();
  return lib;
}
const ext=(name:string)=>name.split(".").pop()?.toLowerCase()||"";
async function fileKind(file:File):Promise<"pdf"|"image"|null>{
  const e=ext(file.name),mime=file.type.toLowerCase();
  if(e==="pdf"||mime==="application/pdf"||mime==="application/x-pdf")return "pdf";
  if(["png","jpg","jpeg","webp"].includes(e)||["image/png","image/jpeg","image/webp"].includes(mime))return "image";
  // スマホの「ファイル」アプリは種類や拡張子を渡さない場合があるため、PDFの先頭記号も確認します。
  try{const head=new Uint8Array(await file.slice(0,5).arrayBuffer());if(String.fromCharCode(...head)==="%PDF-")return "pdf"}catch{}
  return null;
}
function pdfError(file:File,error:unknown){
  const name=error instanceof Error?error.name:"";
  if(name==="PasswordException")return `「${file.name}」はパスワードで保護されているため読み込めません。`;
  if(name==="InvalidPDFException")return `「${file.name}」は壊れているか、PDFとして認識できませんでした。`;
  return `「${file.name}」のPDFを読み込めませんでした。別のPDFでもう一度お試しください。`;
}
const id=()=>`${Date.now()}-${crypto.randomUUID()}`;
const canvas=(w:number,h:number)=>{const c=document.createElement("canvas");c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c};
const toBlob=(c:HTMLCanvasElement,type="image/png",quality?:number)=>new Promise<Blob>((ok,no)=>c.toBlob(b=>b?ok(b):no(new TooLarge()),type,quality));
function save(blob:Blob,name:string){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

async function imageThumb(file:File){
  const b=await createImageBitmap(file); try{if(b.width*b.height>MAX_PIXELS)throw new TooLarge();const s=Math.min(220/b.width,150/b.height,1),c=canvas(b.width*s,b.height*s);c.getContext("2d")!.drawImage(b,0,0,c.width,c.height);return URL.createObjectURL(await toBlob(c,"image/jpeg",.82))}finally{b.close()}
}
async function pdfThumb(pdf:PDFDocumentProxy,n:number){
  const p=await pdf.getPage(n),v0=p.getViewport({scale:1}),v=p.getViewport({scale:Math.min(220/v0.width,150/v0.height)}),c=canvas(v.width,v.height);
  await p.render({canvas:c,canvasContext:c.getContext("2d")!,viewport:v}).promise;return URL.createObjectURL(await toBlob(c,"image/jpeg",.82));
}
async function render(item:Item){
  if(item.kind==="image"){const b=await createImageBitmap(item.file);return{source:b as CanvasImageSource,w:b.width,h:b.height,free:()=>b.close()}}
  if(!item.pdf||!item.page)throw Error();const p=await item.pdf.getPage(item.page),v=p.getViewport({scale:2}),c=canvas(v.width,v.height);await p.render({canvas:c,canvasContext:c.getContext("2d")!,viewport:v}).promise;return{source:c as CanvasImageSource,w:c.width,h:c.height,free:()=>{c.width=c.height=1}};
}
async function join(group:Item[]){
  const imgs:Awaited<ReturnType<typeof render>>[]=[];try{for(const x of group)imgs.push(await render(x));const w=imgs.reduce((a,x)=>a+x.w,0),h=Math.max(...imgs.map(x=>x.h));if(w>MAX_SIDE||h>MAX_SIDE||w*h>MAX_PIXELS)throw new TooLarge();const c=canvas(w,h),ctx=c.getContext("2d",{alpha:false})!;ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);let x=0;for(const im of imgs){ctx.drawImage(im.source,x,Math.floor((h-im.h)/2));x+=im.w}const blob=await toBlob(c);c.width=c.height=1;return{blob,width:w,height:h}}finally{imgs.forEach(x=>x.free())}
}

export default function Home(){
  const [items,setItems]=useState<Item[]>([]),[results,setResults]=useState<Result[]>([]),[group,setGroup]=useState("2"),[custom,setCustom]=useState(""),[format,setFormat]=useState<"png"|"pdf">("png"),[tab,setTab]=useState(0),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState(""),[over,setOver]=useState(false),[inputKey,setInputKey]=useState(0);
  const drag=useRef<string|null>(null),touch=useRef<string|null>(null),itemsRef=useRef(items),resultsRef=useRef(results);itemsRef.current=items;resultsRef.current=results;
  useEffect(()=>()=>{itemsRef.current.forEach(x=>URL.revokeObjectURL(x.thumb));resultsRef.current.forEach(x=>URL.revokeObjectURL(x.url));new Set(itemsRef.current.map(x=>x.pdf).filter(Boolean)).forEach(x=>x?.destroy())},[]);
  const clearResults=()=>{resultsRef.current.forEach(x=>URL.revokeObjectURL(x.url));resultsRef.current=[];setResults([]);setTab(0)};

  async function add(filesLike:FileList|File[]){
    const files=Array.from(filesLike);if(!files.length||busy)return;setBusy(true);setError("");setStatus("読み込み中…");clearResults();const added:Item[]=[],problems:string[]=[];
    for(const file of files){const kind=await fileKind(file);if(!kind){problems.push(`「${file.name}」は対応していない形式です。`);continue}if(file.size>MAX_FILE){problems.push(`「${file.name}」は大きすぎます（上限200MB）。`);continue}
      if(kind==="pdf"){let pdf:PDFDocumentProxy|undefined;const pages:Item[]=[];try{pdf=await(await pdfLib()).getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;for(let n=1;n<=pdf.numPages;n++){setStatus(`読み込み中… ${file.name} ${n}/${pdf.numPages}ページ`);pages.push({id:id(),kind:"pdf",file,name:file.name,page:n,pdf,thumb:await pdfThumb(pdf,n)})}added.push(...pages)}catch(error){pages.forEach(x=>URL.revokeObjectURL(x.thumb));await pdf?.destroy();problems.push(pdfError(file,error))}}
      else try{added.push({id:id(),kind:"image",file,name:file.name,thumb:await imageThumb(file)})}catch(e){problems.push(e instanceof TooLarge?`「${file.name}」は画像サイズが大きすぎます。`:`「${file.name}」の画像を読み込めませんでした。`)}}
    if(added.length)setItems(v=>[...v,...added]);setError(problems.join("\n"));setStatus(added.length?`${added.length}枚を追加しました`:"");setBusy(false);
  }
  function move(from:string,to:string){if(from===to)return;setItems(v=>{const a=v.findIndex(x=>x.id===from),b=v.findIndex(x=>x.id===to);if(a<0||b<0)return v;const n=[...v],[x]=n.splice(a,1);n.splice(b,0,x);return n});clearResults()}
  // 矢印ボタンでは、必ずすぐ隣の1件とだけ入れ替えます。
  function moveStep(target:string,direction:-1|1){setItems(v=>{const from=v.findIndex(x=>x.id===target),to=from+direction;if(from<0||to<0||to>=v.length)return v;const n=[...v];[n[from],n[to]]=[n[to],n[from]];return n});clearResults()}
  function remove(target:Item){URL.revokeObjectURL(target.thumb);setItems(v=>v.filter(x=>x.id!==target.id));clearResults()}
  async function create(){
    setError("");if(!items.length){setError("ファイルが選択されていません。画像またはPDFを追加してください。");return}if(group==="custom"&&!custom.trim()){setError("任意の結合枚数を入力してください。");return}const size=Number(group==="custom"?custom:group);if(!Number.isInteger(size)||size<=1){setError("結合枚数は2以上の整数で入力してください。");return}
    clearResults();setBusy(true);const made:Result[]=[];try{const groups:Item[][]=[];for(let i=0;i<items.length;i+=size)groups.push(items.slice(i,i+size));for(let i=0;i<groups.length;i++){setStatus(`結合中… ${i+1}/${groups.length}`);const out=await join(groups[i]),name=`score_${String(i+1).padStart(2,"0")}.png`;made.push({...out,name,url:URL.createObjectURL(out.blob),count:groups[i].length});await new Promise(r=>setTimeout(r,0))}resultsRef.current=made;setResults(made);setTab(0);setStatus(`${made.length}個の結合結果ができました`)}catch(e){made.forEach(x=>URL.revokeObjectURL(x.url));setError(e instanceof TooLarge?"結合後の画像が大きすぎます。結合枚数を減らしてください。":"結合に失敗しました。ファイルを減らしてお試しください。");setStatus("")}finally{setBusy(false)}
  }
  async function zip(){setBusy(true);setStatus("ZIPを作成中…");try{const z=new JSZip();results.forEach(x=>z.file(x.name,x.blob));save(await z.generateAsync({type:"blob",compression:"DEFLATE"}),"combined_scores.zip");setStatus("ZIPを保存しました")}catch{setError("ZIPを作成できませんでした。") }finally{setBusy(false)}}
  async function pdf(){setBusy(true);setStatus("PDFを作成中…");try{let d:jsPDF|undefined;for(let i=0;i<results.length;i++){const r=results[i],o=r.width>=r.height?"landscape":"portrait";if(!d)d=new jsPDF({orientation:o,unit:"px",format:[r.width,r.height],hotfixes:["px_scaling"],compress:true});else d.addPage([r.width,r.height],o);d.addImage(new Uint8Array(await r.blob.arrayBuffer()),"PNG",0,0,r.width,r.height,undefined,"FAST");setStatus(`PDFを作成中… ${i+1}/${results.length}ページ`);await new Promise(x=>setTimeout(x,0))}if(!d)throw Error();save(d.output("blob"),"combined_score.pdf");setStatus("PDFを保存しました")}catch{setError("PDFを作成できませんでした。結合枚数を減らしてください。") }finally{setBusy(false)}}
  function reset(){const docs=new Set(items.map(x=>x.pdf).filter(Boolean));items.forEach(x=>URL.revokeObjectURL(x.thumb));docs.forEach(x=>x?.destroy());setItems([]);clearResults();setGroup("2");setCustom("");setFormat("png");setError("");setStatus("");setInputKey(x=>x+1)}
  const size=Number(group==="custom"?custom:group),groups=size>1?Math.ceil(items.length/size):0;

  return <main className="shell">
    <header><div className="logo">♩</div><div><small>SCORE JOINER</small><h1>楽譜がっちゃんこ</h1><p>楽譜を並べて、横につなげる。データはこの端末の外へ送られません。</p></div></header>
    <Card n="1" title="ファイルを追加" sub="画像とPDFを一緒に選べます"><label className={`drop ${over?"over":""}`} onDragOver={e=>e.preventDefault()} onDragEnter={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);void add(e.dataTransfer.files)}}><input key={inputKey} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" disabled={busy} onChange={e=>e.target.files&&void add(e.target.files)}/><b>＋</b><strong>ファイルを選択</strong><span>または、ここにドラッグ＆ドロップ</span><em>PNG・JPG・WebP・PDF ／ 1ファイル200MBまで</em></label></Card>
    <Card n="2" title="並び順を確認" sub="上から順に、結合時は左から右へ配置します" badge={`${items.length}枚`}>
      {items.length?<div className="thumbs">{items.map((x,i)=><article key={x.id} data-id={x.id} draggable={!busy} onDragStart={()=>drag.current=x.id} onDragOver={e=>e.preventDefault()} onDrop={()=>drag.current&&move(drag.current,x.id)}><i>{i+1}枚目</i><img src={x.thumb} alt={`${i+1}枚目のプレビュー`}/><div><strong title={x.name}>{x.name}</strong><span>{x.kind==="pdf"?`${x.page}ページ目 / PDF`:ext(x.name).toUpperCase()}</span></div><button className="handle" aria-label={`${i+1}枚目をドラッグして並び替え`} onPointerDown={e=>{if(e.pointerType!=="mouse"){touch.current=x.id;e.currentTarget.setPointerCapture(e.pointerId)}}} onPointerMove={e=>{if(!touch.current||e.pointerType==="mouse")return;const node=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-id]") as HTMLElement|null;const over=node?.dataset.id;if(over)move(touch.current,over)}} onPointerUp={()=>touch.current=null}>⠿</button><nav aria-label={`${i+1}枚目の移動`}><button disabled={i===0} aria-label={`${i+1}枚目を上へ移動`} onClick={()=>moveStep(x.id,-1)}>↑ 上へ</button><button disabled={i===items.length-1} aria-label={`${i+1}枚目を下へ移動`} onClick={()=>moveStep(x.id,1)}>↓ 下へ</button></nav><button className="remove" aria-label={`${i+1}枚目を削除`} onClick={()=>remove(x)}>×</button></article>)}</div>:<Empty text="追加した楽譜がここに並びます"/>}
    </Card>
    <Card n="3" title="結合の設定" sub="1つの出力に何枚つなげますか？">
      <fieldset className="counts"><legend>1ファイルに結合する枚数</legend>{[2,3,4,5].map(n=><label className={group===String(n)?"on":""} key={n}><input type="radio" name="g" checked={group===String(n)} onChange={()=>{setGroup(String(n));clearResults()}}/><b>{n}</b>枚ずつ</label>)}<label className={`custom ${group==="custom"?"on":""}`}><input type="radio" name="g" checked={group==="custom"} onChange={()=>setGroup("custom")}/><span>任意</span><input aria-label="任意の結合枚数" type="number" min="2" placeholder="例: 6" value={custom} onFocus={()=>setGroup("custom")} onChange={e=>{setCustom(e.target.value);clearResults()}}/>枚ずつ</label></fieldset>
      <fieldset className="formats"><legend>出力形式</legend><label className={format==="png"?"on":""}><input type="radio" name="f" checked={format==="png"} onChange={()=>setFormat("png")}/><b>PNG</b><span><strong>PNG画像</strong><small>個別・ZIPで保存</small></span></label><label className={format==="pdf"?"on":""}><input type="radio" name="f" checked={format==="pdf"} onChange={()=>setFormat("pdf")}/><b className="red">PDF</b><span><strong>PDF</strong><small>すべてを1つに保存</small></span></label></fieldset>
      <div className="summary"><span>現在の設定</span><strong>{items.length?`${items.length}枚 → ${groups||"—"}個の出力`:"ファイルを追加してください"}</strong></div><button className="create" disabled={busy} onClick={()=>void create()}>{busy?status||"処理中…":"結合結果を作成"}<span>→</span></button>
    </Card>
    {(error||status)&&<div className={`message ${error?"bad":"good"}`} role={error?"alert":"status"}><b>{error?"!":"✓"}</b><p>{error||status}</p></div>}
    <Card n="4" title="プレビューと保存" sub="表示だけ縮小しています。保存時は元の解像度です">
      {results.length?<><div className="tabs">{results.map((_,i)=><button className={tab===i?"on":""} onClick={()=>setTab(i)} key={i}>出力{i+1}</button>)}</div><div className="preview"><img src={results[tab].url} alt={`出力${tab+1}の結合結果`}/></div><div className="meta"><b>出力{tab+1}</b><span>{results[tab].count}枚を結合</span><span>{results[tab].width.toLocaleString()} × {results[tab].height.toLocaleString()} px</span></div><div className="downloads">{format==="png"?<><button onClick={()=>save(results[tab].blob,results[tab].name)}>表示中のPNGを保存</button>{results.length>1&&<button className="outline" onClick={()=>void zip()}>すべてZIPで保存</button>}<div>{results.map((x,i)=><button key={i} onClick={()=>save(x.blob,x.name)}>出力{i+1}を保存</button>)}</div></>:<button onClick={()=>void pdf()}>combined_score.pdf を保存</button>}</div></>:<Empty text="結合結果を作成すると、ここで確認できます"/>}
    </Card>
    <button className="reset" disabled={busy} onClick={reset}>すべてリセット</button><footer>✓ 端末内だけで処理　　✓ サーバーへの送信なし　　✓ 無料で利用できます</footer>
  </main>
}
function Card({n,title,sub,badge,children}:{n:string;title:string;sub:string;badge?:string;children:React.ReactNode}){return <section className="card"><div className="heading"><b>{n}</b><div><h2>{title}</h2><p>{sub}</p></div>{badge&&<em>{badge}</em>}</div>{children}</section>}
function Empty({text}:{text:string}){return <div className="empty"><b>♬</b><p>{text}</p></div>}
