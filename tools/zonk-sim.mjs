function score(d){const n=[0,0,0,0,0,0,0];for(const x of d)n[x]++;
 if(d.length===6&&n.slice(1).every(x=>x===1))return 1500; if(d.length===6&&n.filter(x=>x===2).length===3)return 750;
 let p=0;for(let f=1;f<=6;f++){let c=n[f];if(c>=3){p+=(f===1?1000:f*100)*2**(c-3);c=0}if(f===1)p+=c*100;else if(f===5)p+=c*50;else if(c>0)return null}return p}
function best(r){const n=[0,0,0,0,0,0,0];for(const x of r)n[x]++;
 if(r.length===6&&(n.slice(1).every(x=>x===1)||n.filter(x=>x===2).length===3))return r;
 return r.filter(v=>v===1||v===5||n[v]>=3)}
const roll=k=>Array.from({length:k},()=>1+Math.floor(Math.random()*6));
function turn(bankAt){let left=6,t=0;for(;;){const r=roll(left);const k=best(r);if(!k.length)return 0;
 // keep minimal: if many 5s/1s singles, keep just one when left large
 let keep=k; const s=score(keep); t+=s; left-=keep.length; if(left===0)left=6;
 if(t>=300 && t>=bankAt[left])return t;}}
function game(target,bankAt){let tot=0;for(let i=0;i<10;i++){tot+=turn(bankAt);if(tot>=target)return true}return false}
const pols={a:[0,300,300,350,500,1000,99999],b:[0,300,400,500,800,1500,99999],c:[0,300,300,300,400,600,99999],d:[0,600,800,1000,1500,2500,99999]};
for(const [nm,p] of Object.entries(pols)){const N=40000;const out=[4000,5500,7000,10000].map(T=>{let w=0;for(let i=0;i<N;i++)if(game(T,p))w++;return (w/N*100).toFixed(1)});
 let s=0;for(let i=0;i<N;i++)s+=turn(p);console.log(nm,out.join(' '),'avg/turn',(s/N).toFixed(0))}
