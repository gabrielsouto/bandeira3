import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFerry } from './ferry.js';
import { makeVehicle } from './models.js';

const cube=new THREE.BoxGeometry(1,1,1);
const wheel=new THREE.CylinderGeometry(.5,.5,1,12).rotateX(Math.PI/2);
const mats=new Map();
function paint(color){
  if(!mats.has(color))mats.set(color,new THREE.MeshLambertMaterial({color,flatShading:true}));
  return mats.get(color);
}
function piece(group,shape,x,y,z,w,h,d,color){
  const mesh=new THREE.Mesh(shape,paint(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);return mesh;
}
function consolidate(group){
  const chunks=group.children.map(mesh=>{
    mesh.updateMatrix();const geo=mesh.geometry.toNonIndexed().applyMatrix4(mesh.matrix);
    geo.deleteAttribute('uv');const c=mesh.material.color,colors=[];
    for(let i=0;i<geo.attributes.position.count;i++)colors.push(c.r,c.g,c.b);
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geo;
  });
  const geometry=mergeGeometries(chunks);group.clear();
  group.add(new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true})));
  chunks.forEach(g=>g.dispose());
}
const templates=new Map();
export function vehicleModel(spr,police){
  const art=police?'viatura':spr.art;
  const key=[art,spr.body,spr.bag].join(':');
  if(templates.has(key))return templates.get(key).clone();
  const body=spr.body;
  let group=new THREE.Group();
  const box=(...args)=>piece(group,cube,...args);
  const wheels=(x,y,z,size)=>piece(group,wheel,x,y,z,size,size,1.1,'#242c32');
  if(['car','taxi','escola','viatura'].includes(art)){
    group=makeVehicle(body,art==='taxi');
    if(art==='escola')box(0,7.9,0,5,1.1,3,'#e95a43');
    if(art==='viatura')for(const s of [-1,1])box(-1,7.9,s*1.7,2.3,1,3.3,s===1?'#437cff':'#fa4451');
  }else if(art==='moto'||art==='bike'){
    const bike=art==='bike',r=bike?3.2:3.6;
    for(const x of [-4.8,4.8])wheels(x,r*.5,0,r);
    box(0,2.3,0,9,bike?.65:1.8,bike?.7:2.4,body);
    box(-.3,3.8,0,3.8,1,2.3,'#30343a');
    box(.8,5.6,0,2,3.5,2.4,'#345979');box(1.2,8,0,2.3,2.2,2.3,'#e9e9ce');
    box(3.2,4.8,0,1.2,.55,4.3,'#3d434b');
    if(spr.bag)box(-3.5,5.1,0,3.8,3.7,3.6,typeof spr.bag==='string'?spr.bag:body);
    consolidate(group);
  }else if(art==='helicoptero'){
    box(-5,3.3,0,13,1,1.4,body);box(-10.2,5,0,2,4.2,1.1,body);
    box(2.4,4.8,0,10,5.6,6.4,body);box(5.75,5.45,0,4,3.35,6.65,'#3e6273');
    for(const s of [-1,1]){box(1,1,s*3.4,11,.65,.65,'#455465');box(1,2,s*2.8,1,2.8,.6,'#455465');}
    box(1,8.3,0,1.1,2,1.1,'#485459');consolidate(group);
    const rotor=box(1,9.4,0,32,.29,1.1,'#455361');rotor.name='rotor';
  }else if(art==='barca'){
    buildFerry(group,body,piece);
    consolidate(group);
  }else{
    const rail=art==='vlt',bus=art==='onibus',ambulance=art==='ambulancia';
    const len=rail?30:bus?24:21,w=rail?8.7:9.4,h=rail?8:bus?10:8.8;
    box(0,2.2,0,len,2,w,body);box(0,h*.57,0,len-.5,h*.64,w,body);
    box(len/2-1,h*.69,0,2,h*.35,w+.08,'#365366');
    for(const side of [-1,1]){
      const sideZ=side*(w/2+.05);
      if(bus||rail)for(let x=-len/2+2.5;x<len/2-1;x+=3.9)box(x,h*.7,sideZ,3.1,h*.3,.18,'#3e6172');
      else {box(len/2-4,h*.7,sideZ,3.8,h*.31,.2,'#3e6172');box(-2,4,sideZ,len*.65,.9,.18,ambulance?'#da4e50':'#d8dace');}
      for(const x of [-len*.31,len*.31])wheels(x,1.55,side*w*.46,3.1);
      if(ambulance){box(-3,6.1,sideZ,4,1.1,.3,'#e64d48');box(-3,6.1,sideZ,1.1,3.7,.3,'#e64d48');}
    }
    box(0,h,0,len-.5,.75,w-.2,rail?'#ced7d6':body);
    if(ambulance)box(5,h+.7,0,2,1,5,'#f55f60');
    if(rail)box(0,h+.45,0,2,1,w,'#495466');consolidate(group);
  }
  // Pequena sombra de contato também identifica a posição do helicóptero no pouso.
  templates.set(key,group);return group.clone();
}
export function personModel(){
  const g=new THREE.Group();
  for(const s of [-1,1])piece(g,cube,s*.66,1.7,0,1,3.2,1.1,'#384a59');
  piece(g,cube,0,4.4,0,2.7,2.8,1.65,'#fff');
  piece(g,cube,0,6.7,0,1.9,1.9,1.7,'#c89870');
  piece(g,cube,0,7.5,0,2,.66,1.8,'#333');
  piece(g,cube,1.65,4.4,0,.64,2.5,.85,'#c89870');return g;
}
export function posePerson(g,shirt,hair,anim,wave){
  g.children[0].rotation.x=.42*Math.sin(anim*2.4);
  g.children[1].rotation.x=-g.children[0].rotation.x;
  g.children[2].material=paint(shirt);g.children[4].material=paint(hair);
  g.children[5].position.y=wave?6:4.4;
  g.children[5].rotation.z=wave?.55+.26*Math.sin(anim*3):0;
}
