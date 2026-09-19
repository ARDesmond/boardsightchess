const http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const root=__dirname;
http.createServer((req,res)=>{
  let file;
  try { file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0])); }
  catch {res.writeHead(400);res.end();return;}
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end('Not found');return;}
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
    res.end(data);
  });
}).listen(8001,'127.0.0.1',()=>console.log('Boardsight: http://127.0.0.1:8001'));
