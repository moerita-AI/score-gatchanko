import type { Metadata } from "next";
import "./globals.css";
import "./reorder.css";

const title="楽譜がっちゃんこ｜画像・PDFの楽譜を横につなげる無料ツール";
const description="画像やPDFの楽譜を好きな順番に並べ、ブラウザだけで横につなげてPNG・PDFとして保存できる無料ツールです。スマホにも対応し、選択したファイルはサーバーへ送信されません。";

export const metadata:Metadata={
  metadataBase:new URL("https://moerita-ai.github.io/"),
  title,
  description,
  alternates:{canonical:"/score-gatchanko/"},
  robots:{index:true,follow:true},
  applicationName:"楽譜がっちゃんこ",
  verification:{google:"QGUgCXrvic3ouN7k04gaRT_3wiB3ztdBS1x6O_A0P1o"},
  icons:{icon:"/score-gatchanko/favicon.svg"},
  openGraph:{title,description,images:[{url:"/score-gatchanko/og.png",width:1536,height:864,alt:title}]},
  twitter:{card:"summary_large_image",title,description,images:["/score-gatchanko/og.png"]},
};

export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
