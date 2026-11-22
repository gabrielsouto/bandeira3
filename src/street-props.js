import * as THREE from 'three';

// Um lote de cubos por quadro para animais, encomendas e sinalização das ruas.
export function streetProps(scene) {
  const parts=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial(),4096);
  const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),1024);
  const transform=new THREE.Object3D(),color=new THREE.Color();
  for(const batch of [parts,lamps]){
    batch.frustumCulled=false;batch.count=0;batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(batch);
  }
  function box(x,y,z,w,h,d,tint,glow=false){
    const batch=glow?lamps:parts;
    if(batch.count>=batch.instanceMatrix.count)return;
    transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();
    batch.setMatrixAt(batch.count,transform.matrix);batch.setColorAt(batch.count++,color.set(tint));
  }
  function pet(p,x,z){
    const dir=p.flip?-1:1,sz=p.dog?1:.73,body=p.col,down=p.down>0;
    const limb=(u,y,v,w,h,d)=>box(x+dir*u*sz,(down?.45:1)*y*sz+.2,z+v*sz,w*sz,h*sz*(down?.45:1),d*sz,body);
    limb(0,2.1,0,4.6,1.8,1.8);limb(2,3.2,0,1.7,1.55,1.7);
    limb(2.9,2.95,0,.9,.65,1.15);limb(-2.45,2.8,0,.65,p.dog?1.5:2.4,.65);
    for(const foot of [-1,1])for(const side of [-1,1])limb(foot*1.45+.26*Math.sin(p.anim*2+foot*side),.86,side*.63,.63,1.6,.63);
  }
  function parcel(x,z,big){
    const w=big?4.7:3.3;
    box(x,3.8,z,w,w*.83,w,'#bd8754');box(x,3.82,z,w*.22,w*.85,w+.05,'#e9c896');
  }
  function signal(h,phase){
    const dx=h.a.dx,dz=h.a.dy,r=h.lanes*8+2;
    const poleX=h.hx-dz*r,poleZ=h.hy+dx*r;
    box(poleX,8,poleZ,.8,16,.8,'#5a6669');
    box((poleX+h.hx)/2,16,(poleZ+h.hy)/2,Math.abs(dz*r)+1,.7,Math.abs(dx*r)+1,'#65767a');
    box(h.hx,14,h.hy,dx?1.5:3,5.9,dx?3:1.5,'#26343a');
    for(const [i,p] of ['r','y','g'].entries()){
      const c=phase===p?{r:'#ff5454',y:'#ffd147',g:'#53ef89'}[p]:'#46504c';
      box(h.hx-.81*dx,15.65-1.65*i,h.hy-.81*dz,dx?.24:1.4,1.3,dx?1.4:.24,c,phase===p);
    }
  }
  return {pet,parcel,signal,begin(){parts.count=lamps.count=0;},finish(){
    for(const batch of [parts,lamps]){
      batch.instanceMatrix.needsUpdate=true;if(batch.instanceColor)batch.instanceColor.needsUpdate=true;
    }
  }};
}
