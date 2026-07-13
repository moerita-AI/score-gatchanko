import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata():Promise<Metadata>{
  const requestHeaders=await headers();
  const host=requestHeaders.get("host")||"localhost";
  const protocol=requestHeaders.get("x-forwarded-proto")||(host.startsWith("localhost")?"http":"https");
  const title="楽譜がっちゃんこ";
  const description="画像とPDFの楽譜をブラウザだけで横につなげて保存できます。";
  return{metadataBase:new URL(`${protocol}://${host}`),title,description,icons:{icon:"/favicon.svg"},openGraph:{title,description,images:[{url:"/og.png",width:1536,height:864,alt:title}]},twitter:{card:"summary_large_image",title,description,images:["/og.png"]}};
}
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
