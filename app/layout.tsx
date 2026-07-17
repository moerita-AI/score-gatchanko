import type { Metadata } from "next";
import "./globals.css";
import "./reorder.css";

const title="楽譜がっちゃんこ";
const description="画像とPDFの楽譜をブラウザだけで横につなげて保存できます。";

export const metadata:Metadata={
  metadataBase:new URL("https://moerita-ai.github.io/"),
  title,
  description,
  icons:{icon:"/score-gatchanko/favicon.svg"},
  openGraph:{title,description,images:[{url:"/score-gatchanko/og.png",width:1536,height:864,alt:title}]},
  twitter:{card:"summary_large_image",title,description,images:["/score-gatchanko/og.png"]},
};

export default function Layout({children}:{children:React.ReactNode}){return <html lang="ja"><body>{children}</body></html>}
