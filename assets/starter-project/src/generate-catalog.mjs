import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createProjectServer } from "./server.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const {server,url}=await createProjectServer(root,0,true);
let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(`${url}/src/render.html`);
  await fs.mkdir(path.join(root,"assets/catalog"),{recursive:true});
  for(const genre of ["mv","studio","product","report"]){
    const png=await page.evaluate(async(kind)=>{
      const {renderCatalog}=await import("/src/catalog-scenes.js");
      const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=720;
      renderCatalog(canvas.getContext("2d"),kind);
      return canvas.toDataURL("image/png").split(",")[1];
    },genre);
    const file=path.join(root,`assets/catalog/${genre}-v2.png`);
    await fs.writeFile(file,Buffer.from(png,"base64"));console.log(file);
  }
}finally{await browser?.close();await new Promise((resolve)=>server.close(resolve));}
