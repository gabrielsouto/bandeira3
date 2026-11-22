import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,flatShading:true});
const cube=new THREE.BoxGeometry(1,1,1);
const tire=new THREE.CylinderGeometry(1,1,1,12).rotateX(Math.PI/2);
const taxiYellow='#ffc125';
const carCache=new Map();

function label(text,background,ink,w,h){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,256,80);
  ctx.font='bold 58px Arial';ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,128,43);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map}));
}
function cabin(){
  // Seções transversais do para-brisa, teto e vidro traseiro.
  const g=new THREE.BufferGeometry();
  const p=[[-6.8,4,-4.45],[-6.8,4,4.45],[4.6,4,4.45],[4.6,4,-4.45],[-3.9,7.25,-3.6],[-3.9,7.25,3.6],[1.9,7.25,3.6],[1.9,7.25,-3.6]];
  const faces=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]];
  const pos=[],col=[];
  faces.forEach(([a,b,c,d],i)=>{
    const color=new THREE.Color(['#54818e','#385764','#8ab7c2','#466773','#587481'][i]);
    for(const v of [a,b,c,a,c,d]){pos.push(...p[v]);col.push(color.r,color.g,color.b);}
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
}
function vehicleGeometry(color,taxi){
  const parts=[];
  function part(shape,x,y,z,w,h,d,tint){
    const geo=shape.clone().toNonIndexed();geo.deleteAttribute('uv');
    geo.scale(w,h,d).translate(x,y,z);
    const c=new THREE.Color(tint),colors=[];
    for(let i=0;i<geo.attributes.position.count;i++) colors.push(c.r,c.g,c.b);
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(geo);
  }
  const box=(...args)=>part(cube,...args);
  box(0,1.8,0,19,1.4,8.9,'#29373c');
  box(0,3.1,0,20.2,2.6,9.3,color);
  box(7.25,4.15,0,5.5,.6,9.05,color);box(-8.15,4.1,0,3.65,.55,9,color);
  parts.push(cabin());
  const roofTint=new THREE.Color(color).lerp(new THREE.Color('#cfdae0'),.075);
  box(-1,7.3,0,6.2,.43,7.5,roofTint);
  for(const side of [-1,1]){
    box(-1.05,5.55,side*4.07,.52,2.76,.52,color);
    box(-.5,3.6,side*4.68,18.8,.56,.12,taxi?'#224959':color);
    box(.8,3.95,side*4.72,.85,.18,.18,'#39484a');
    box(2.1,4.75,side*4.98,.98,.58,.93,color);
    for(const x of [-6.45,6.15]){
      part(tire,x,1.85,side*4.38,1.85,1.85,1.12,'#263136');
      part(tire,x,1.85,side*4.99,1.02,1.02,.15,'#b6b9af');
    }
    box(-10.18,3.45,side*3.28,.26,1,2.35,'#bc3e32');
    box(10.18,3.45,side*3.28,.26,1,2.2,'#fff0bc');
  }
  box(-10.22,2.18,0,.38,.5,8.7,'#515a59');box(10.2,2.55,0,.28,.67,4.1,'#34454b');
  if(taxi)box(-1,8.03,0,2.45,1.36,4,'#ffdc6a');
  const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());return result;
}
export function makeVehicle(color=taxiYellow,taxi=false){
  const key=color+taxi;if(!carCache.has(key))carCache.set(key,vehicleGeometry(color,taxi));
  const group=new THREE.Group(),shell=new THREE.Mesh(carCache.get(key),material);
  shell.castShadow=true;shell.receiveShadow=true;group.add(shell);
  if(taxi){
    const sign=label('TÁXI','#ffde72','#202a28',3.85,1.30);
    sign.rotation.y=-Math.PI/2;sign.position.set(-2.24,8.05,0);group.add(sign);
    const plate=label('BND 0003','#f5f0dc','#304551',3.35,.95);
    plate.rotation.y=-Math.PI/2;plate.position.set(-10.13,3.25,0);group.add(plate);
  }
  return group;
}
export function makePassenger(){
  const group=new THREE.Group(),legs=[];
  function limb(x,y,z,w,h,d,color){
    const mesh=new THREE.Mesh(cube,new THREE.MeshStandardMaterial({color}));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
    mesh.castShadow=true;group.add(mesh);return mesh;
  }
  for(const s of [-1,1])legs.push(limb(s*.61,1.85,0,.92,3.7,1.15,'#294a59'));
  limb(0,4.9,0,2.75,3.15,1.65,'#e7704d');
  for(const s of [-1,1])limb(s*1.67,4.65,0,.7,2.9,.86,'#a86a4c');
  limb(0,7.35,0,1.85,1.9,1.72,'#ae7153');limb(0,8.15,0,1.96,.71,1.83,'#543a33');
  group.userData.legs=legs;return group;
}
