import * as THREE from 'three';
import { streetProps } from './street-props.js';
import { makeCity } from './city-view.js';
import { vehicleModel, personModel, posePerson } from './fleet.js';

// A simulação em js/main.js continua dona de todos os estados do jogo.
// O desenho de cada frame envia exatamente os atores escolhidos pela modalidade.
export function create({canvas, surface, atlas, city, overhead, lamps}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(overhead?40:60,1,.45,5500);
  const day=new THREE.Color('#a9d8e6'),night=new THREE.Color('#16263e');
  scene.background=day.clone();scene.fog=new THREE.Fog(day,420,2300);
  const ambient=new THREE.HemisphereLight('#fffae6','#9fabb4',1.6);
  const sun=new THREE.DirectionalLight('#ffe2ab',2.05);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  const reach=overhead?330:250;
  Object.assign(sun.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:1,far:1250});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00016;sun.shadow.normalBias=.16;
  scene.add(sun,sun.target,ambient);
  const props=streetProps(scene);
  const town=makeCity(scene,city,atlas,surface,lamps);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(3900,28,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{dark:{value:0}},
    vertexShader:'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 dir;uniform float dark;void main(){
      vec3 d=normalize(dir);float t=smoothstep(-.10,.36,d.y);
      vec3 day=mix(vec3(.94,.86,.71),vec3(.15,.55,.80),t);
      float disk=smoothstep(.9991,.9995,dot(d,normalize(vec3(-1.,.68,-.45))));
      vec3 c=mix(day,vec3(1.,.95,.78),disk);
      gl_FragColor=vec4(mix(c,mix(vec3(.025,.044,.08),vec3(.006,.012,.03),t),dark),1.);
      #include <colorspace_fragment>
    }`
  }));
  scene.add(sky);
  const skyBand=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:'#789e91',flatShading:true}),64);
  const dummy=new THREE.Object3D();
  for(let i=0;i<64;i++){
    const a=i*Math.PI/32,r=2100+Math.sin(i*19)*190;
    dummy.position.set(atlas.width/2+r*Math.cos(a),-49,atlas.height/2+r*Math.sin(a));
    dummy.scale.set(265,140+80*Math.sin(i*4),300);dummy.rotation.y=i;dummy.updateMatrix();skyBand.setMatrixAt(i,dummy.matrix);
  }
  scene.add(skyBand);
  const announcer=document.createElement('canvas');
  announcer.className='world-labels';canvas.after(announcer);
  const ui=announcer.getContext('2d');
  const point=new THREE.Vector3(), pools=new Map(), people=[];
  let usedPeople=0,frame=null,heading=0,prevX=NaN,prevZ=NaN,lastDark=-1,width=0,height=0;
  function resize(){
    width=innerWidth;height=innerHeight;renderer.setSize(width,height,false);
    announcer.width=width;announcer.height=height;camera.aspect=width/height;camera.updateProjectionMatrix();
  }
  function begin(state){
    if(width!==innerWidth||height!==innerHeight)resize();
    frame=state;usedPeople=0;props.begin();
    for(const pool of pools.values())pool.used=0;
    const p=state.player, jumped=!Number.isFinite(prevX)||Math.hypot(p.x-prevX,p.y-prevZ)>36;
    const da=Math.atan2(Math.sin(p.a-heading),Math.cos(p.a-heading));
    heading=jumped?p.a:heading+da*(1-Math.exp(-Math.max(0,state.dt)*8));
    prevX=p.x;prevZ=p.y;
    const ahead=overhead?0:70;
    const focusX=Math.round((p.x+Math.cos(heading)*ahead)/2)*2;
    const focusZ=Math.round((p.y+Math.sin(heading)*ahead)/2)*2;
    sun.target.position.set(focusX,0,focusZ);sun.position.set(focusX-420,286,focusZ-189);
    const air=state.flightHeight;
    if(overhead){
      const span=Math.max(195,Math.min(320,innerHeight/2.6));
      const high=span/(2*Math.tan(camera.fov*Math.PI/360));
      const x=state.focus.x,z=state.focus.y;
      camera.position.set(x,high+air,z+high*.095);camera.lookAt(x,air,z);
    }else{
      const fx=Math.cos(heading),fz=Math.sin(heading);
      const back=state.walking?30:45;
      camera.position.set(p.x-back*fx-3*fz,air+10+back*.29,p.y-back*fz+3*fx);
      town.clearSight(p.x,p.y,camera.position);
      camera.lookAt(p.x+(state.walking?15:25)*fx,air+(state.walking?4:6.3),p.y+(state.walking?15:25)*fz);
    }
    sky.position.copy(camera.position);sky.material.uniforms.dark.value=state.dark;
    camera.updateMatrixWorld();
    ui.clearRect(0,0,width,height);
    if(lastDark!==state.dark){
      sun.shadow.autoUpdate=state.dark<.99;
      lastDark=state.dark;scene.background.copy(day).lerp(night,state.dark);scene.fog.color.copy(scene.background);
      sun.intensity=2.05-1.77*state.dark;ambient.intensity=1.4-.88*state.dark;
    }
  }
  function vehicle(spr,x,z,a,brake,isPlayer,isPolice,alpha){
    if(Math.hypot(x-frame.player.x,z-frame.player.y)>(overhead?650:1050))return;
    const key=[spr.body,spr.art,spr.bag,isPolice,alpha<1].join(':');
    if(!pools.has(key))pools.set(key,{used:0,models:[]});
    const pool=pools.get(key);
    let model=pool.models[pool.used++];
    if(!model){
      model=vehicleModel(spr,isPolice);
      model.traverse(part=>{if(part.isMesh)part.castShadow=true;});
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,20).rotateX(-Math.PI/2),
        new THREE.MeshBasicMaterial({color:'#151927',transparent:true,opacity:.23,depthWrite:false}));
      shadow.scale.set(spr.img.width*.53,1,spr.img.height*.55);
      shadow.position.set(.8,-.23,.7);model.add(shadow);
      if(alpha<1)model.traverse(m=>{if(m.material){m.material=m.material.clone();m.material.transparent=true;m.material.depthWrite=false;}});
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.35,.72,spr.art==='moto'||spr.art==='bike'?1.2:4.8),new THREE.MeshBasicMaterial({color:'#ff4744'}));
      lamp.position.set(-spr.img.width/2-.16,2.65,0);model.add(lamp);model.userData.brake=lamp;
      if(isPolice||spr.art==='viatura'){
        const beacon=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.02,3.2),new THREE.MeshBasicMaterial({color:'#ff4246'}));
        beacon.position.set(-1,8,1.7);model.add(beacon);model.userData.beacon=beacon;
      }
      scene.add(model);pool.models.push(model);
    }
    model.visible=true;
    if(alpha<1)model.traverse(m=>{if(m.material?.transparent)m.material.opacity=alpha;});
    model.userData.brake.visible=brake&&spr.art!=='helicoptero'&&spr.art!=='barca';
    if(model.userData.beacon){
      model.userData.beacon.visible=isPolice||frame.siren;
      model.userData.beacon.material.color.set(Math.floor(frame.time*8)%2?'#398cff':'#ff4149');
    }
    const rotor=model.getObjectByName('rotor');
    if(rotor)rotor.rotation.y=frame.flying?frame.time*28:0;
    model.position.set(x,.34+(isPlayer?frame.flightHeight:0),z);model.rotation.y=-a;
  }
  function person(x,z,shirt,hair,anim,wave){
    let model=people[usedPeople++];
    if(!model){model=personModel();people.push(model);scene.add(model);}
    posePerson(model,shirt,hair,anim,wave);model.visible=true;model.position.set(x,.38,z);
    model.rotation.y=overhead?0:Math.PI/2-heading;
  }
  function textAt(text,x,y,color,size=14){
    ui.font='bold '+size+'px monospace';ui.textAlign='center';
    ui.lineWidth=3;ui.strokeStyle='rgba(0,0,0,.8)';ui.strokeText(text,x,y);ui.fillStyle=color;ui.fillText(text,x,y);
  }
  function worldText(text,x,z,color,lift=13){
    point.set(x,lift,z).project(camera);
    if(point.z>=-1&&point.z<=1)textAt(text,(point.x+1)*width/2,(1-point.y)*height/2,color);
  }
  function direction(target,icon){
    const p=frame.player,dx=target.x-p.x,dz=target.y-p.y,dist=Math.hypot(dx,dz);
    if(dist<=40)return;
    const a=overhead?Math.atan2(dz,dx):Math.atan2(-(Math.cos(heading)*dx+Math.sin(heading)*dz),-Math.sin(heading)*dx+Math.cos(heading)*dz);
    point.set(p.x,frame.flightHeight+5,p.y).project(camera);
    const radius=Math.min(65,height*.10);
    ui.save();ui.translate((point.x+1)*width/2+radius*Math.cos(a),(1-point.y)*height/2+radius*Math.sin(a));
    ui.rotate(a);ui.imageSmoothingEnabled=false;ui.drawImage(icon,-9,-9,18,18);ui.restore();
  }
  function finish(x,z){
    town.sync(x,z,frame.dark);
    for(const pool of pools.values())for(let i=pool.used;i<pool.models.length;i++)pool.models[i].visible=false;
    for(let i=usedPeople;i<people.length;i++)people[i].visible=false;
    props.finish();renderer.render(scene,camera);frame=null;
  }
  return {begin,finish,vehicle,person,props,direction,worldText,announcement:t=>textAt(t,width/2,height*.42,'#ffd23f',42),height:town.height};
}
