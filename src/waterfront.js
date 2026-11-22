import * as THREE from 'three';

function frondGeometry() {
  const points = [[0,0,0],[.27,.16,-.08],[.29,.22,0],[.27,.16,.08],
    [.65,.045,-.095],[.66,.10,0],[.65,.045,.095],[1,-.22,0]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0,2,1,0,3,2,1,2,4,4,2,5,2,3,6,2,6,5,4,5,7,5,6,7]);
  geometry.computeVertexNormals();
  return geometry;
}

// Instâncias compartilham a geometria. As palmeiras ocupam as árvores sólidas do mapa.
export function waterfront(scene, city, lamps) {
  const shapes = {
    box: new THREE.BoxGeometry(), trunk: new THREE.CylinderGeometry(.38,.56,1,8),
    leaf: frondGeometry(), canopy: new THREE.ConeGeometry(1,1,8)
  };
  const lit = new THREE.MeshLambertMaterial({flatShading:true});
  const leaves = lit.clone(); leaves.side = THREE.DoubleSide;
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  const batches = new Map();
  const meshes = [];
  function place(shape,x,y,z,w,h,d,color,rotation=0,lean=0) {
    transform.position.set(x,y,z); transform.scale.set(w,h,d);
    transform.rotation.set(0,rotation,lean); transform.updateMatrix();
    if (!batches.has(shape)) batches.set(shape,[]);
    batches.get(shape).push([transform.matrix.clone(),color]);
  }
  function palm(x,z,seed) {
    const height=23+seed%11, lean=.07+(seed%4)*.015;
    place('trunk',x,height/2,z,1.9,height,1.9,'#94744e',0,lean);
    for(let i=0;i<8;i++){
      const size=height*(.51+((i*7+seed)%9)*.021);
      place('leaf',x-height*.5*Math.sin(lean),height-.12,z,size,size,size,
        ['#438356','#589451','#317b57','#73a356'][(seed+i)%4],seed+i*Math.PI/4);
    }
  }
  function refresh() {
    for(const mesh of meshes){scene.remove(mesh);mesh.dispose();}
    meshes.length=0;batches.clear();
    for(let j=2;j<city.H-2;j++)for(let i=2;i<city.W-2;i++){
      if(!city.onCoast(i,j))continue;
      const tile=city.get(i,j), x=i*16+8,z=j*16+8,seed=i*37+j*19;
      if(tile===5){palm(x,z,seed);continue;}
      if(tile!==0)continue;
      const onHorizontal=j===3||j===city.H-4;
      const onVertical=i===3||i===city.W-4;
      if(!(onHorizontal&&i%12===5 || onVertical&&j%12===5))continue;
      place('trunk',x,3.8,z,.54,7.6,.54,'#9f7952');
      place('canopy',x,8,z,5.4,2.9,5.4,seed%3?'#ef8559':'#eab854',seed);
      const angle=onHorizontal?0:Math.PI/2;
      const bx=x+(onHorizontal?8:0),bz=z+(onHorizontal?0:8);
      place('box',bx,1.9,bz,6.7,.6,2.25,'#b77e52',angle);
      place('box',bx+(onHorizontal?0:.88),3,bz+(onHorizontal?.88:0),6.7,1.75,.45,'#ac704b',angle);
      for(const side of [-1,1])place('box',bx+(onHorizontal?side*2.1:0),.9,bz+(onHorizontal?0:side*2.1),.65,1.8,1.6,'#50605d',angle);
    }
    for(const lamp of lamps){
      if(lamp.r>46)continue;
      place('trunk',lamp.x,9,lamp.y,.8,18,.8,'#566363');
      place('box',lamp.x,18,lamp.y+1.1,.7,.7,2.8,'#566363');
      place('box',lamp.x,17.8,lamp.y+2.7,1.45,.65,2.3,'#fff0be');
    }
    for(const [shape,items] of batches){
      const batch=new THREE.InstancedMesh(shapes[shape],shape==='leaf'?leaves:lit,items.length);
      items.forEach(([matrix,color],i)=>{batch.setMatrixAt(i,matrix);batch.setColorAt(i,tint.set(color));});
      batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);meshes.push(batch);
    }
    batches.clear();
  }
  refresh();
  return refresh;
}
