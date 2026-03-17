<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>NexusChat – Connect Beyond Boundaries</title>
<link rel="stylesheet" href="../css/style.css"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
<style>
/* ── base ── */
body{overflow-x:hidden;overflow-y:auto;}
.splash{display:flex;flex-direction:column;min-height:100svh;position:relative;z-index:1;}
.splash-nav{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 2.2rem;z-index:10;animation:fadeDown .55s ease both;flex-wrap:nowrap;gap:.5rem;}
.slogo{display:flex;align-items:center;gap:.55rem;text-decoration:none;flex-shrink:0;}
.slogo-ico{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:1rem;color:#fff;box-shadow:0 3px 14px var(--glow);}
.slogo-txt{font-family:'Space Grotesk',sans-serif;font-size:1.25rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.snav-r{display:flex;align-items:center;gap:.6rem;flex-shrink:0;}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem 1.5rem;}
.hero-badge{display:inline-flex;align-items:center;gap:.45rem;background:rgba(124,111,255,.12);border:1px solid rgba(124,111,255,.28);border-radius:var(--rPill);padding:.34rem .95rem;font-size:.78rem;font-weight:700;color:var(--accent);margin-bottom:1.4rem;animation:fadeDown .55s .1s ease both;}
.hero-title{font-family:'Space Grotesk',sans-serif;font-size:clamp(2rem,6.5vw,5.2rem);font-weight:700;line-height:1.06;margin-bottom:1.1rem;letter-spacing:-.02em;}
.htw{display:inline-block;animation:letterReveal .65s cubic-bezier(.16,1,.3,1) both;}
.hgrad{background:linear-gradient(135deg,var(--accent),var(--accent2),var(--accent3));background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:letterReveal .65s cubic-bezier(.16,1,.3,1) .12s both,gradShift 4s ease infinite;}
.hero-sub{color:var(--textM);font-size:clamp(.9rem,2vw,1.15rem);max-width:500px;line-height:1.75;margin-bottom:1.85rem;animation:fadeUp .55s .3s ease both;}
.hero-btns{display:flex;gap:.65rem;flex-wrap:wrap;justify-content:center;margin-bottom:2rem;animation:fadeUp .55s .4s ease both;}
.feat-strip{display:flex;gap:.65rem;flex-wrap:wrap;justify-content:center;animation:fadeUp .55s .5s ease both;}
.fpill{display:flex;align-items:center;gap:.45rem;background:var(--glass);backdrop-filter:blur(12px);border:1px solid var(--glassBr);border-radius:var(--rPill);padding:.42rem .9rem;font-size:.78rem;font-weight:600;color:var(--textM);transition:all .2s;}
.fpill:hover{border-color:var(--accent);color:var(--text);transform:translateY(-2px);}
.fpill i{color:var(--accent);font-size:.8rem;}
.stats{display:flex;gap:2.2rem;justify-content:center;flex-wrap:wrap;padding:1.8rem 1.5rem;border-top:1px solid var(--border2);animation:fadeUp .55s .6s ease both;}
.stat-n{font-family:'Space Grotesk',sans-serif;font-size:1.9rem;font-weight:700;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.stat-l{font-size:.75rem;color:var(--textM);margin-top:.15rem;}
canvas#pc{position:fixed;inset:0;z-index:0;pointer-events:none;}
.orb{position:fixed;border-radius:50%;filter:blur(95px);pointer-events:none;z-index:0;}
.o1{width:520px;height:520px;background:radial-gradient(var(--accent),transparent 70%);top:-14%;left:-8%;opacity:.16;animation:float 12s ease-in-out infinite;}
.o2{width:460px;height:460px;background:radial-gradient(var(--accent2),transparent 70%);bottom:-8%;right:-5%;opacity:.13;animation:float 15s ease-in-out infinite reverse;}
.o3{width:320px;height:320px;background:radial-gradient(var(--accent3),transparent 70%);top:38%;right:18%;opacity:.09;animation:float 10s ease-in-out infinite;}

/* ── Tablet (≤768px) ── */
@media(max-width:768px){
  .splash-nav{padding:.9rem 1.4rem;}
  .hero{padding:1.8rem 1.2rem;}
  .hero-title{font-size:clamp(1.9rem,7vw,3.2rem);}
  .stats{gap:1.6rem;padding:1.4rem 1rem;}
  .feat-strip{gap:.5rem;}
  .fpill{padding:.36rem .72rem;font-size:.75rem;}
}

/* ── Mobile (≤600px) ── */
@media(max-width:600px){
  .splash-nav{padding:.82rem 1rem;}
  .snav-r .btn-ghost{display:none;} /* hide "Sign In" ghost btn, keep "Get Started" */
  .slogo-txt{font-size:1.1rem;}
  .hero{padding:1.4rem 1rem 1rem;}
  .hero-badge{font-size:.72rem;padding:.28rem .75rem;margin-bottom:1rem;}
  .hero-title{font-size:clamp(1.75rem,8vw,2.6rem);margin-bottom:.9rem;}
  .hero-sub{font-size:.88rem;margin-bottom:1.4rem;}
  .hero-btns{gap:.5rem;margin-bottom:1.4rem;}
  .hero-btns .btn-xl{padding:.78rem 1.4rem;font-size:.9rem;}
  .feat-strip{gap:.4rem;}
  .fpill{padding:.32rem .62rem;font-size:.72rem;}
  .stats{gap:1.2rem;padding:1.2rem .8rem;}
  .stat-n{font-size:1.55rem;}
  .stat-l{font-size:.7rem;}
  /* Shrink orbs so they don't cause overflow */
  .o1{width:280px;height:280px;}
  .o2{width:240px;height:240px;}
  .o3{display:none;}
}

/* ── Small Mobile (≤380px) ── */
@media(max-width:380px){
  .splash-nav{padding:.7rem .85rem;}
  .slogo-txt{display:none;}
  .hero-title{font-size:clamp(1.55rem,9vw,2.2rem);}
  .hero-btns{flex-direction:column;align-items:stretch;}
  .hero-btns .btn{width:100%;justify-content:center;}
  .stats{gap:.9rem;}
  .stat-n{font-size:1.35rem;}
}
</style>
</head>
<body>
<canvas id="pc"></canvas>
<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
<div class="splash">
  <nav class="splash-nav">
    <div class="slogo"><div class="slogo-ico"><i class="fas fa-bolt"></i></div><span class="slogo-txt">Nexus Chat</span></div>
    <div class="snav-r">
      <button class="theme-btn" id="thbtn" onclick="toggleTheme()"><i class="fas fa-moon" id="thico"></i></button>
      <a href="login.html" class="btn btn-ghost btn-sm">Sign In</a>
      <a href="register.html" class="btn btn-primary btn-sm">Get Started <i class="fas fa-arrow-right"></i></a>
    </div>
  </nav>
  <main class="hero">
    <div class="hero-badge"><i class="fas fa-bolt"></i> Real-time · Secure · Anonymous · Global</div>
    <h1 class="hero-title">
      <div><span class="htw" style="animation-delay:.04s">Connect</span>&nbsp;<span class="htw" style="animation-delay:.09s">Without</span></div>
      <div><span class="hgrad">Boundaries</span></div>
    </h1>
    <p class="hero-sub">Global chat, private rooms, anonymous ghost mode, and Omegle-style random matching — all in one stunning platform.</p>
    <div class="hero-btns">
      <a href="register.html" class="btn btn-primary btn-xl"><i class="fas fa-rocket"></i> Start for Free</a>
      <a href="login.html" class="btn btn-ghost btn-xl"><i class="fas fa-sign-in-alt"></i> Sign In</a>
    </div>
    <div class="feat-strip">
      <div class="fpill"><i class="fas fa-globe"></i> Global Rooms</div>
      <div class="fpill"><i class="fas fa-ghost"></i> Anonymous Mode</div>
      <div class="fpill"><i class="fas fa-random"></i> Random Match</div>
      <div class="fpill"><i class="fas fa-lock"></i> Private Rooms</div>
      <div class="fpill"><i class="fas fa-film"></i> GIFs & Emoji</div>
      <div class="fpill"><i class="fas fa-bell"></i> Notifications</div>
    </div>
  </main>
 
</div>
<div id="toast-box"></div>
<script type="module">
import{initializeApp}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import{getDatabase,ref,get}from"https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
const cfg={apiKey:"AIzaSyBeT226lzGP0ERDY7QZhKF8zfo0OwSGEZ4",authDomain:"fir-50409.firebaseapp.com",databaseURL:"https://fir-50409-default-rtdb.firebaseio.com",projectId:"fir-50409",storageBucket:"fir-50409.firebasestorage.app",messagingSenderId:"336958746825",appId:"1:336958746825:web:dc23031418217663b85d18"};
const app=initializeApp(cfg),auth=getAuth(app),db=getDatabase(app);
// Theme
const st=localStorage.getItem('nc_theme')||'dark';
document.documentElement.setAttribute('data-theme',st);
document.getElementById('thico').className=st==='dark'?'fas fa-moon':'fas fa-sun';
window.toggleTheme=()=>{const c=document.documentElement.getAttribute('data-theme'),n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('nc_theme',n);document.getElementById('thico').className=n==='dark'?'fas fa-moon':'fas fa-sun';};
// Auth check
onAuthStateChanged(auth,async u=>{if(u){const s=await get(ref(db,`users/${u.uid}/username`));location.href=s.exists()?'../views/dashboard.html':'create-username.html';}});
// Particles
const cv=document.getElementById('pc'),cx=cv.getContext('2d');
let pts=[];
function resize(){cv.width=innerWidth;cv.height=innerHeight;}resize();window.addEventListener('resize',resize);
class P{constructor(){this.r();}r(){this.x=Math.random()*innerWidth;this.y=Math.random()*innerHeight;this.r=Math.random()*1.8+.4;this.vx=(Math.random()-.5)*.38;this.vy=(Math.random()-.5)*.38;this.op=Math.random()*.45+.12;this.c=Math.random()>.5?'#7C6FFF':'#FF5FA0';}}
for(let i=0;i<75;i++)pts.push(new P());
function frame(){cx.clearRect(0,0,cv.width,cv.height);for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d<115){cx.beginPath();cx.moveTo(pts[i].x,pts[i].y);cx.lineTo(pts[j].x,pts[j].y);cx.strokeStyle=`rgba(124,111,255,${(1-d/115)*.1})`;cx.lineWidth=.5;cx.stroke();}}}pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight)p.r();cx.beginPath();cx.arc(p.x,p.y,p.r,0,Math.PI*2);cx.fillStyle=p.c;cx.globalAlpha=p.op;cx.fill();cx.globalAlpha=1;});requestAnimationFrame(frame);}frame();
// Counters
</script>
</body>
</html>
