// Veille Électrique 3D - WebGL prototype
// Game states and core logic with 3D rendering
const STATES = { MENU:'MENU', PLAY:'PLAY', GAMEOVER:'GAMEOVER', WIN:'WIN', TRANSITION:'TRANSITION' };

class RNG {
  constructor(seed = Date.now()) { this.seed = seed >>> 0; }
  next(){ let x=this.seed; x^=x<<13; x^=x>>>17; x^=x<<5; this.seed = x>>>0; return this.seed/0xffffffff; }
  range(min,max){ return min+(max-min)*this.next(); }
}

class Enemy {
  constructor(name,color,path,model){
    this.name=name; this.color=color; this.path=path; this.model=model;
    this.position=0; this.cooldown=0; this.visible=false; this.jumpscareFrame=0;
  }
  reset(){ this.position=0; this.cooldown=0; this.visible=false; this.jumpscareFrame=0; }
  currentZone(){ return this.path[this.position]; }
}

class Patroller extends Enemy {
  constructor(path){ super('Errant-8','#60a5fa',path,'tower'); }
  update(game,dt){
    this.cooldown -= dt; if (this.cooldown>0) return;
    const base = 0.08 + game.night*0.05;
    if (game.rng.next() < base*dt){
      this.position = Math.min(this.position+1,this.path.length-1);
      this.cooldown = 2 - Math.min(1.4, game.night*0.25);
    }
  }
}

class Opportunist extends Enemy {
  constructor(path){ super('Guette-scan','#fbbf24',path,'orb'); this.cameraExposure=0; }
  reset(){ super.reset(); this.cameraExposure=0; }
  update(game,dt){
    this.cameraExposure = game.cameraOpen ? this.cameraExposure+dt : Math.max(0,this.cameraExposure-dt);
    const p = Math.min(0.6,(0.05+game.night*0.05)*(1+this.cameraExposure*0.6));
    if (game.rng.next() < p*dt) this.position = Math.min(this.position+1,this.path.length-1);
  }
}

class Aggressor extends Enemy {
  constructor(path){ super('Choc-Sentinelle','#f472b6',path,'blade'); this.anger=0; }
  reset(){ super.reset(); this.anger=0; }
  update(game,dt){
    if (game.leftDoor||game.rightDoor||game.leftLight||game.rightLight) this.anger += dt*(0.8+0.15*game.night);
    else this.anger = Math.max(0,this.anger-dt*0.5);
    if (game.energy<=15) this.anger += dt*1.4;
    const trigger = 0.07 + this.anger*0.02 + game.night*0.03;
    if (game.rng.next() < trigger*dt) this.position = Math.min(this.position+1,this.path.length-1);
  }
}

class WebGLRenderer {
  constructor(canvas){
    this.canvas=canvas;
    this.gl = canvas.getContext('webgl',{antialias:true});
    if(!this.gl) throw new Error('WebGL non disponible');
    this.program = this.createProgram();
    this.attribs = {
      position: this.gl.getAttribLocation(this.program,'aPos'),
      color: this.gl.getAttribLocation(this.program,'aColor')
    };
    this.uniforms = {
      matrix: this.gl.getUniformLocation(this.program,'uMVP')
    };
    this.initGeometry();
  }
  createShader(type,src){
    const s=this.gl.createShader(type); this.gl.shaderSource(s,src); this.gl.compileShader(s);
    if(!this.gl.getShaderParameter(s,this.gl.COMPILE_STATUS)) throw new Error(this.gl.getShaderInfoLog(s));
    return s;
  }
  createProgram(){
    const vs=`attribute vec3 aPos; attribute vec3 aColor; varying vec3 vColor; uniform mat4 uMVP; void main(){ vColor=aColor; gl_Position=uMVP*vec4(aPos,1.0); }`;
    const fs=`precision mediump float; varying vec3 vColor; void main(){ gl_FragColor=vec4(vColor,1.0); }`;
    const p=this.gl.createProgram(); this.gl.attachShader(p,this.createShader(this.gl.VERTEX_SHADER,vs)); this.gl.attachShader(p,this.createShader(this.gl.FRAGMENT_SHADER,fs)); this.gl.linkProgram(p);
    if(!this.gl.getProgramParameter(p,this.gl.LINK_STATUS)) throw new Error(this.gl.getProgramInfoLog(p));
    return p;
  }
  initGeometry(){
    // unit cube centered at origin
    const c=[
      // position        // color placeholder (overwritten via uniform buffer)
      -0.5,-0.5, 0.5, 1,1,1,  0.5,-0.5, 0.5, 1,1,1,  0.5, 0.5, 0.5, 1,1,1,  -0.5, 0.5, 0.5, 1,1,1,
      -0.5,-0.5,-0.5, 1,1,1,  0.5,-0.5,-0.5, 1,1,1,  0.5, 0.5,-0.5, 1,1,1,  -0.5, 0.5,-0.5, 1,1,1
    ];
    const idx=[
      0,1,2, 0,2,3, // front
      1,5,6, 1,6,2, // right
      5,4,7, 5,7,6, // back
      4,0,3, 4,3,7, // left
      3,2,6, 3,6,7, // top
      4,5,1, 4,1,0  // bottom
    ];
    this.vertexBuffer=this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(c),this.gl.STATIC_DRAW);
    this.indexBuffer=this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),this.gl.STATIC_DRAW);
    this.indexCount=idx.length;
  }
  resize(){
    const gl=this.gl, cvs=this.canvas;
    const displayWidth = cvs.clientWidth | 0; const displayHeight = cvs.clientHeight | 0;
    if(cvs.width!==displayWidth || cvs.height!==displayHeight){ cvs.width=displayWidth; cvs.height=displayHeight; }
    gl.viewport(0,0,cvs.width,cvs.height);
  }
  drawScene(objects,view,camera){
    const gl=this.gl; this.resize();
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0.02,0.03,0.05,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
    gl.enableVertexAttribArray(this.attribs.position);
    gl.vertexAttribPointer(this.attribs.position,3,gl.FLOAT,false,24,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    gl.disableVertexAttribArray(this.attribs.color);
    objects.forEach(obj=>{
      const mvp = multiplyMat4(camera, multiplyMat4(view,this.buildModel(obj)));
      gl.uniformMatrix4fv(this.uniforms.matrix,false,mvp);
      gl.vertexAttrib3f(this.attribs.color,obj.color[0],obj.color[1],obj.color[2]);
      gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
    });
  }
  buildModel(obj){
    const t=translateMat4(obj.pos[0],obj.pos[1],obj.pos[2]);
    const s=scaleMat4(obj.scale[0],obj.scale[1],obj.scale[2]);
    const r=rotateYMat4(obj.rot||0);
    return multiplyMat4(t,multiplyMat4(r,s));
  }
}

// Matrix helpers
function perspective(fov,aspect,near,far){
  const f=1/Math.tan(fov/2); const nf=1/(near-far);
  return new Float32Array([
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,(2*far*near)*nf,0
  ]);
}
function multiplyMat4(a,b){
  const out=new Float32Array(16);
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++){
      out[j*4+i]=a[0*4+i]*b[j*4+0]+a[1*4+i]*b[j*4+1]+a[2*4+i]*b[j*4+2]+a[3*4+i]*b[j*4+3];
    }
  }
  return out;
}
function translateMat4(x,y,z){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
function scaleMat4(x,y,z){ return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); }
function rotateYMat4(rad){ const c=Math.cos(rad), s=Math.sin(rad); return new Float32Array([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]); }
function lookAt(eye,target){
  const up=[0,1,0];
  const z0=eye[0]-target[0], z1=eye[1]-target[1], z2=eye[2]-target[2];
  let len=Math.hypot(z0,z1,z2); const zx=z0/len, zy=z1/len, zz=z2/len;
  let x0=up[1]*zz - up[2]*zy, x1=up[2]*zx - up[0]*zz, x2=up[0]*zy - up[1]*zx;
  len=Math.hypot(x0,x1,x2); x0/=len; x1/=len; x2/=len;
  const y0=zy*x2 - zz*x1, y1=zz*x0 - zx*x2, y2=zx*x1 - zy*x0;
  return new Float32Array([
    x0, y0, zx, 0,
    x1, y1, zy, 0,
    x2, y2, zz, 0,
    -(x0*eye[0]+x1*eye[1]+x2*eye[2]),
    -(y0*eye[0]+y1*eye[1]+y2*eye[2]),
    -(zx*eye[0]+zy*eye[1]+zz*eye[2]),
    1
  ]);
}

class Game {
  constructor(){
    this.canvas=document.getElementById('gameCanvas');
    this.renderer=new WebGLRenderer(this.canvas);
    this.state=STATES.MENU; this.night=1; this.nightLength=360; this.elapsed=0; this.energy=100;
    this.passiveDrain=0.6; this.cameraDrain=4; this.lightDrain=6; this.doorDrain=5;
    this.leftDoor=false; this.rightDoor=false; this.leftLight=false; this.rightLight=false;
    this.cameraOpen=false; this.selectedCam=0; this.reduceFlash=false; this.debug=false; this.accelerate=false;
    this.rng=new RNG(); this.camUsage=0; this.lastTime=0;
    this.cameras=['Entrepôt','Couloir nord','Atelier','Salle des fusibles','Hall vitré','Stockage','Ascenseur'];
    this.cameraStates=new Array(this.cameras.length).fill('');
    this.zones=[
      {pos:[-6,0,6], target:[0,1,0]},
      {pos:[0,0,8], target:[0,1,0]},
      {pos:[6,0,6], target:[0,1,0]},
      {pos:[-6,0,-2], target:[0,1,0]},
      {pos:[0,0,-4], target:[0,1,0]},
      {pos:[6,0,-2], target:[0,1,0]},
      {pos:[0,0,-8], target:[0,1,0]},
    ];
    this.enemies=[ new Patroller([0,1,3,5,6]), new Opportunist([2,3,4,6]), new Aggressor([1,2,4,6]) ];
    this.bindUI();
    this.loop=this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindUI(){
    this.nightLabel=document.getElementById('nightLabel');
    this.timeLabel=document.getElementById('timeLabel');
    this.energyLabel=document.getElementById('energyLabel');
    this.camPanel=document.getElementById('cameraPanel');
    this.camInfo=document.getElementById('camInfo');
    this.camUsageLabel=document.getElementById('camUsage');
    this.stateOverlay=document.getElementById('stateOverlay');
    this.menuOverlay=document.getElementById('menuOverlay');
    this.debugPanel=document.getElementById('debugPanel');

    document.getElementById('playBtn').onclick=()=>this.startNight();
    document.getElementById('optionsBtn').onclick=()=>{ document.getElementById('options').classList.toggle('hidden'); document.getElementById('credits').classList.add('hidden'); };
    document.getElementById('creditsBtn').onclick=()=>{ document.getElementById('credits').classList.toggle('hidden'); document.getElementById('options').classList.add('hidden'); };
    document.getElementById('nightLengthInput').onchange=(e)=>{ this.nightLength=Math.max(60,Math.min(360,Number(e.target.value))); };
    document.getElementById('reduceFlash').onchange=(e)=>{ this.reduceFlash=e.target.checked; };

    document.getElementById('leftDoor').onclick=()=>this.toggleDoor('left');
    document.getElementById('rightDoor').onclick=()=>this.toggleDoor('right');
    document.getElementById('leftLight').onclick=()=>this.toggleLight('left');
    document.getElementById('rightLight').onclick=()=>this.toggleLight('right');
    document.getElementById('cameraToggle').onclick=()=>this.toggleCamera();

    const grid=document.getElementById('camGrid'); grid.innerHTML='';
    this.cameras.forEach((cam,idx)=>{ const b=document.createElement('button'); b.className='camBtn'; b.textContent=cam; b.onclick=()=>this.selectCamera(idx); grid.appendChild(b); });

    window.addEventListener('keydown',(e)=>this.handleKey(e));
  }

  handleKey(e){
    if(e.key==='q'||e.key==='Q') this.toggleDoor('left');
    if(e.key==='s'||e.key==='S') this.toggleDoor('right');
    if(e.key==='a'||e.key==='A') this.toggleLight('left');
    if(e.key==='d'&&e.shiftKey) this.debug=!this.debug;
    else if(e.key==='d'||e.key==='D') this.toggleLight('right');
    if(e.key==='e'||e.key==='E') this.toggleCamera();
    if(e.key===' ' && (this.state===STATES.GAMEOVER||this.state===STATES.WIN)) this.nextNight();
    if(e.key==='f'||e.key==='F') this.accelerate=!this.accelerate;
  }

  toggleDoor(side){ if(this.state!==STATES.PLAY) return; const prop=side==='left'?'leftDoor':'rightDoor'; this[prop]=!this[prop]; audioSystem.thud(); }
  toggleLight(side){ if(this.state!==STATES.PLAY) return; const prop=side==='left'?'leftLight':'rightLight'; this[prop]=!this[prop]; if(this[prop]) audioSystem.beep({freq:680,duration:0.08}); }
  toggleCamera(){ if(this.state!==STATES.PLAY) return; this.cameraOpen=!this.cameraOpen; this.camPanel.classList.toggle('active',this.cameraOpen); if(this.cameraOpen) audioSystem.confirm(); }
  selectCamera(idx){ this.selectedCam=idx; this.camInfo.textContent=`${this.cameras[idx]} : ${this.cameraStates[idx]||'Silence...'}`; }

  startNight(){ this.menuOverlay.classList.add('hidden'); this.stateOverlay.classList.add('hidden'); this.reset(); this.state=STATES.PLAY; this.lastTime=performance.now(); audioSystem.confirm(); }
  reset(){ this.elapsed=0; this.energy=100; this.leftDoor=this.rightDoor=this.leftLight=this.rightLight=false; this.cameraOpen=false; this.camPanel.classList.remove('active'); this.camUsage=0; this.enemies.forEach(e=>e.reset()); this.rng=new RNG(this.night*2024+Date.now()); }

  update(dt){
    if(this.state!==STATES.PLAY) return;
    const speed=this.accelerate?8:1; dt*=speed; this.elapsed+=dt; this.camUsage = this.cameraOpen?this.camUsage+dt:Math.max(0,this.camUsage-dt*0.5);
    const actionDrain=(this.leftDoor+this.rightDoor)*this.doorDrain + (this.leftLight+this.rightLight)*this.lightDrain + (this.cameraOpen?this.cameraDrain:0);
    this.energy=Math.max(0,this.energy-(this.passiveDrain+actionDrain)*dt/60);
    this.updateEnemies(dt); this.checkThreats();
    if(this.energy<=0){ this.leftDoor=this.rightDoor=false; this.leftLight=this.rightLight=false; this.cameraOpen=false; this.camPanel.classList.remove('active'); }
    if(this.elapsed>=this.nightLength) this.winNight();
  }

  updateEnemies(dt){
    this.enemies.forEach(e=>e.update(this,dt));
    this.enemies.forEach(enemy=>{
      const zone=enemy.currentZone();
      if(this.cameraOpen && this.selectedCam===zone){ enemy.visible=true; this.cameraStates[zone]=`${enemy.name} détecté`; }
      else if(enemy.visible) enemy.visible=false;
    });
  }

  checkThreats(){
    this.enemies.forEach(enemy=>{
      if(enemy.position>=enemy.path.length-1){
        const threatSide = enemy.path[enemy.path.length-1]%2===0?'left':'right';
        const doorClosed = threatSide==='left'?this.leftDoor:this.rightDoor;
        const lightOn = threatSide==='left'?this.leftLight:this.rightLight;
        if(!doorClosed) this.triggerJumpscare(enemy); else if(lightOn) enemy.position=Math.max(0,enemy.position-1);
      }
    });
  }

  triggerJumpscare(enemy){
    this.state=STATES.GAMEOVER; this.stateOverlay.classList.remove('hidden');
    this.stateOverlay.innerHTML=`<div>Interruption par ${enemy.name}!</div><button onclick="game.restartNight()">Rejouer</button>`;
    audioSystem.danger();
  }

  winNight(){
    this.state=STATES.WIN; this.stateOverlay.classList.remove('hidden');
    if(this.night>=5) this.stateOverlay.innerHTML='<div>Fin de la cinquième nuit! Vous avez tenu.</div><button onclick="game.restartNight(true)">Rejouer Nuit 5</button>';
    else this.stateOverlay.innerHTML=`<div>Nuit ${this.night} terminée</div><button onclick="game.nextNight()">Continuer</button>`;
    audioSystem.confirm();
  }

  restartNight(stay){ if(!stay) this.state=STATES.PLAY; this.stateOverlay.classList.add('hidden'); this.reset(); this.lastTime=performance.now(); }
  nextNight(){ if(this.night<5) this.night++; this.nightLabel.textContent=`Nuit ${this.night}`; this.stateOverlay.classList.add('hidden'); this.state=STATES.PLAY; this.reset(); this.lastTime=performance.now(); }

  formatTime(){ const ratio=Math.min(1,this.elapsed/this.nightLength); const hours=Math.floor(ratio*6); const minutes=Math.floor((ratio*6-hours)*60); return `${('0'+hours).slice(-2)}:${('0'+minutes).slice(-2)}`; }

  buildObjects(){
    const objs=[];
    // floor slab
    objs.push({pos:[0,-1.2,0], scale:[14,0.4,18], rot:0, color:[0.08,0.11,0.15]});
    // walls frame
    objs.push({pos:[0,2,-9], scale:[14,4,0.3], rot:0, color:[0.1,0.14,0.18]});
    objs.push({pos:[-7,2,0], scale:[0.3,4,18], rot:0, color:[0.1,0.14,0.18]});
    objs.push({pos:[7,2,0], scale:[0.3,4,18], rot:0, color:[0.1,0.14,0.18]});
    // desk
    objs.push({pos:[0,-0.2,-7], scale:[6,0.4,2], rot:0, color:[0.18,0.18,0.22]});
    // door shields as vertical slabs
    objs.push({pos:[-7,1,-6], scale:[0.2,3,2], rot:0, color:this.leftDoor?[0.1,0.9,0.3]:[0.7,0.1,0.1]});
    objs.push({pos:[7,1,-6], scale:[0.2,3,2], rot:0, color:this.rightDoor?[0.1,0.9,0.3]:[0.7,0.1,0.1]});
    // lights cones approximated as thin columns
    if(this.leftLight) objs.push({pos:[-6,0,-4], scale:[0.3,3,0.3], rot:0, color:[1,0.95,this.reduceFlash?0.6:0.2]});
    if(this.rightLight) objs.push({pos:[6,0,-4], scale:[0.3,3,0.3], rot:0, color:[1,0.95,this.reduceFlash?0.6:0.2]});

    // enemies
    this.enemies.forEach((enemy,idx)=>{
      const zone=this.zones[enemy.currentZone()].pos;
      const base=[zone[0], -0.8, zone[2]];
      let scale=[1.4,2.8,1.4]; let rot=enemy.currentZone()*0.5;
      if(enemy.model==='orb'){ scale=[1.1,1.1,1.1]; base[1]=0.4; rot=performance.now()*0.001; }
      if(enemy.model==='blade'){ scale=[1,3.2,0.8]; rot=Math.sin(performance.now()*0.001+idx); }
      const col = enemy.model==='orb'? [1,0.86,0.35]: enemy.model==='blade'?[0.95,0.45,0.75]:[0.4,0.68,0.98];
      objs.push({pos:base, scale, rot, color:col});
    });
    return objs;
  }

  currentView(){
    if(this.cameraOpen){
      const cam=this.zones[this.selectedCam];
      const eye=[cam.pos[0], 4, cam.pos[2]+4];
      const target=[cam.target[0], cam.target[1], cam.target[2]];
      const view=lookAt(eye,target);
      const proj=perspective(Math.PI/3, this.canvas.width/this.canvas.height, 0.1, 60);
      return multiplyMat4(proj,view);
    }
    const view=lookAt([0,3,-14],[0,1,0]);
    const proj=perspective(Math.PI/3, this.canvas.width/this.canvas.height, 0.1, 60);
    return multiplyMat4(proj,view);
  }

  render(){
    const objects=this.buildObjects();
    const camera=this.currentView();
    const view=translateMat4(0,0,0); // identity placeholder
    this.renderer.drawScene(objects,view,camera);
    this.timeLabel.textContent=this.formatTime();
    this.energyLabel.textContent=`Énergie ${this.energy.toFixed(0)}%`;
    this.camUsageLabel.textContent=`Charge: ${this.camUsage.toFixed(1)}s`;
    if(this.debug){
      this.debugPanel.classList.remove('hidden');
      this.debugPanel.textContent=`Night ${this.night}\nState ${this.state}\nEnergy ${this.energy.toFixed(1)}\nElapsed ${this.elapsed.toFixed(1)}\nCam ${this.selectedCam} open ${this.cameraOpen}\nEnemies:\n`+this.enemies.map(e=>`${e.name} -> zone ${e.currentZone()}`).join('\n');
    } else this.debugPanel.classList.add('hidden');
  }

  loop(ts){
    const dt=(ts-this.lastTime)/1000 || 0; this.lastTime=ts; this.update(dt); this.render(); requestAnimationFrame(this.loop);
  }
}

window.addEventListener('load',()=>{ window.game=new Game(); });
