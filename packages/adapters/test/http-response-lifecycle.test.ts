import { it, expect } from 'vitest';
import { createServer, request, Agent } from 'node:http';
import { once } from 'node:events';

it('retains the captured socket when the shared Node HTTP client detaches res.socket before user end',async()=>{
 // Numeric loopback only, no credentials or DNS. HTTPS uses the same _http_client lifecycle.
 const server=createServer((_req,res)=>{res.writeHead(400,{'content-type':'application/json'});res.end('{}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const agent=new Agent({keepAlive:false,maxSockets:1});
 try {
  const observation=await new Promise<{captured:boolean,current:boolean,complete:boolean}>((resolve,reject)=>{
   const address=server.address();if(!address||typeof address==='string')throw Error('fixture address');
   const req=request({host:'127.0.0.1',port:address.port,method:'POST',agent},res=>{const captured=res.socket;res.resume();res.on('error',reject);res.on('end',()=>resolve({captured:!!captured,current:!!res.socket,complete:res.complete}));});
   req.on('error',reject);req.end('{}');
  });
  expect(observation.captured).toBe(true);expect(observation.current).toBe(false);expect(observation.complete).toBe(true);
 }finally{agent.destroy();server.close();await once(server,'close');}
});
