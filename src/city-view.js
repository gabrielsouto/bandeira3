import * as THREE from 'three';
import { waterfront } from './waterfront.js';

// O mapa pintado pelo jogo inclui oficinas, colégios, hospitais e as marcas dos pneus.
// O mesmo sistema de coordenadas projeta a arte nos telhados e no chão.
function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
export function makeCity(scene, city, atlas, frame, lamps) {
  const width=atlas.width, depth=atlas.height;
  const hiddenBlocks = {value:new THREE.Vector4(-1,-1,-1,-1)};
  const blockVertex = 'attribute float blockId; varying float id;';
  const blockFragment = 'varying float id; uniform vec4 hiddenBlocks; bool blocked(){return any(lessThan(abs(vec4(id)-hiddenBlocks),vec4(.25)));}';
  const uniforms={hiddenBlocks,
    atlas:{value:texture(atlas)}, localMap:{value:texture(frame)},
    size:{value:new THREE.Vector2(width,depth)}, mapRegion:{value:new THREE.Vector4()},
    night:{value:0}, sea:{value:new THREE.Color('#58aaa6')}
  };
  const painted=new THREE.ShaderMaterial({
    uniforms, vertexShader:blockVertex+`varying vec2 world;
      void main(){id=blockId;vec4 p=modelMatrix*vec4(position,1.);world=p.xz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:blockFragment+`uniform sampler2D atlas,localMap; uniform vec2 size; uniform vec4 mapRegion;
      uniform float night; uniform vec3 sea; varying vec2 world;
      bool inside(vec2 uv){return all(greaterThanEqual(uv,vec2(0.)))&&all(lessThan(uv,vec2(1.)));}
      void main(){if(blocked())discard;vec2 base=world/size;vec2 local=(world-mapRegion.xy)/mapRegion.zw;
        vec3 c=inside(base)?texture2D(atlas,vec2(base.x,1.-base.y)).rgb:sea;
        c*=mix(vec3(1.),vec3(.20,.23,.34),night);
        if(inside(local))c=texture2D(localMap,vec2(local.x,1.-local.y)).rgb;
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`
  });
  painted.defaultAttributeValues.blockId=[0];
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(13000,13000).rotateX(-Math.PI/2),painted);
  ocean.position.set(width/2,0,depth/2);scene.add(ocean);
  // O chão pintado contém os objetivos do jogo. A camada transparente recebe
  // a sombra real sem trocar a textura nem apagar as luzes dos faróis à noite.
  const shade=new THREE.ShadowMaterial({color:'#433d36',opacity:.32,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const receiver=new THREE.Mesh(ocean.geometry,shade);
  receiver.position.copy(ocean.position);receiver.receiveShadow=true;scene.add(receiver);
  const refreshCoast=waterfront(scene,city,lamps);
  const heightMap=new Float32Array(city.W*city.H);
  const palette=['#e1b497','#a8c4be','#b18c85','#d3be9f','#9eaf92','#92b6c2','#deab87','#a1aaa8'];
  const positions=[],colors=[],uvs=[],roof=[],wallIds=[],roofIds=[];
  const ids=new Uint16Array(city.W*city.H);
  let nextId=0;
  function wall(a,b,c,d,col,w,h){
    for(const [v,u,t] of [[a,0,0],[b,w,0],[c,w,h],[a,0,0],[c,w,h],[d,0,h]]){
      wallIds.push(nextId);positions.push(...v);colors.push(col.r,col.g,col.b);uvs.push(u,t);
    }
  }
  function building(b,h) {
    nextId++;
    const x=b.x0*16,z=b.y0*16,X=(b.x1+1)*16,Z=(b.y1+1)*16;
    const color=new THREE.Color(palette[b.color%palette.length]);
    const north=color.clone().multiplyScalar(1.08), east=color.clone().multiplyScalar(.75);
    wall([x,0,z],[X,0,z],[X,h,z],[x,h,z],north,X-x,h);
    wall([X,0,Z],[x,0,Z],[x,h,Z],[X,h,Z],color,X-x,h);
    const side=color.clone().multiplyScalar(1.16);
    wall([x,0,Z],[x,0,z],[x,h,z],[x,h,Z],side,Z-z,h);
    wall([X,0,z],[X,0,Z],[X,h,Z],[X,h,z],east,Z-z,h);
    for(const p of [[x,h,z],[x,h,Z],[X,h,Z],[x,h,z],[X,h,Z],[X,h,z]]){roof.push(...p);roofIds.push(nextId);}
    for(let j=b.y0;j<=b.y1;j++)for(let i=b.x0;i<=b.x1;i++){heightMap[i+j*city.W]=h;ids[i+j*city.W]=nextId;}
  }
  for(const b of city.buildings) building(b,12+8*((b.color+3*b.style)%6));
  const facade=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,vertexColors:true,uniforms:{night:uniforms.night,hiddenBlocks},
    vertexShader:blockVertex+`varying vec3 tint;varying vec2 meters;void main(){id=blockId;tint=color;meters=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:blockFragment+`varying vec3 tint;varying vec2 meters;uniform float night;
      void main(){if(blocked())discard;vec2 pane=fract(meters/vec2(10.,8.));vec2 cell=floor(meters/vec2(10.,8.));
        float windowMask=step(.18,pane.x)*step(pane.x,.77)*step(.28,pane.y)*step(pane.y,.82);
        vec3 plaster=tint*(.76+.24*step(.09,pane.y));
        float light=step(.47,fract(sin(dot(cell,vec2(11.3,46.8)))*3162.18));
        if(meters.y<7.)windowMask=step(.10,pane.x)*step(pane.x,.90)*step(.08,pane.y);
        float sill=step(.20,pane.y)*step(pane.y,.27)*step(.12,pane.x)*step(pane.x,.84);
        plaster=mix(plaster,plaster*1.28,sill);
        vec3 glass=mix(vec3(.075,.16,.19),vec3(.85,.58,.24),night*light);
        gl_FragColor=vec4(mix(plaster*(1.-.78*night),glass,windowMask),1.);
        #include <colorspace_fragment>
      }`
  });
  function surfaces(){
    const walls=new THREE.BufferGeometry();
    walls.setAttribute('blockId',new THREE.Float32BufferAttribute(wallIds,1));
    walls.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    walls.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    walls.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const tops=new THREE.BufferGeometry();tops.setAttribute('position',new THREE.Float32BufferAttribute(roof,3));
    tops.setAttribute('blockId',new THREE.Float32BufferAttribute(roofIds,1));
    const skyline=new THREE.Mesh(walls,facade), rooftops=new THREE.Mesh(tops,painted);
    skyline.castShadow=rooftops.castShadow=true;scene.add(skyline,rooftops);
    positions.length=colors.length=uvs.length=roof.length=wallIds.length=roofIds.length=0;
  }
  surfaces();
  const treeTiles=[];
  for(let z=0;z<city.H;z++)for(let x=0;x<city.W;x++)if(city.get(x,z)===5 && !city.onCoast(x,z))treeTiles.push([x,z]);
  const leaves=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({flatShading:true}),treeTiles.length);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1,1.5,1,7),new THREE.MeshLambertMaterial({color:'#896543'}),treeTiles.length);
  const dummy=new THREE.Object3D();
  function syncTrees(){
    treeTiles.forEach(([x,z],i)=>{
      const alive=city.get(x,z)===5?1:0,h=12+(x*7+z*19)%7;
      dummy.position.set(16*x+8,h*.28,16*z+8);dummy.scale.set(alive,h*.56*alive,alive);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.y=h*.8;dummy.scale.set(7*alive,(h*.47)*alive,7.2*alive);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);
      leaves.setColorAt(i,new THREE.Color((x+z)%3?'#4a8058':'#65905e'));
    });
    leaves.instanceMatrix.needsUpdate=trunks.instanceMatrix.needsUpdate=true;
  }
  syncTrees();trunks.castShadow=leaves.castShadow=true;scene.add(trunks,leaves);
  let places=city.places.length,fw=frame.width,fh=frame.height;
  function sync(x,z,dark){
    if(city.places.length!==places){
      const home=city.places.find(p=>p.kind==='casa');
      if(home){
        const a=home.tile(0,1),b=home.tile(2,2);
        building({x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y),color:3},12);
        surfaces();syncTrees();refreshCoast();uniforms.atlas.value.needsUpdate=true;
      }
      places=city.places.length;
    }
    if(fw!==frame.width||fh!==frame.height){
      uniforms.localMap.value.dispose();uniforms.localMap.value=texture(frame);fw=frame.width;fh=frame.height;
    }
    uniforms.localMap.value.needsUpdate=true;
    uniforms.mapRegion.value.set(x,z,fw,fh);uniforms.night.value=dark;shade.opacity=.32*(1-dark);receiver.visible=dark<.99;
  }
  // Oculta apenas os prédios que atravessam a linha de visão entre a câmera e o veículo.
  function clearSight(x,z,eye){
    const found=[];
    for(let t=.06;t<=1.08;t+=.05){
      const wx=x+(eye.x-x)*t,wz=z+(eye.z-z)*t;
      const i=Math.floor(wx/16),j=Math.floor(wz/16);
      if(i<0||j<0||i>=city.W||j>=city.H)continue;
      const k=i+j*city.W;
      if(heightMap[k]>eye.y*t && ids[k] && !found.includes(ids[k]))found.push(ids[k]);
    }
    hiddenBlocks.value.set(found[0]??-1,found[1]??-1,found[2]??-1,found[3]??-1);
  }
  return {sync,clearSight,height(x,z){return heightMap[Math.floor(z/16)*city.W+Math.floor(x/16)]||0;}};
}
