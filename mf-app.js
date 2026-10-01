let installPrompt=null;
const installButton=document.getElementById('installApp');
const installHint=document.getElementById('installHint');
function installed(){return window.matchMedia('(display-mode: standalone)').matches;}
function showInstall(){document.getElementById('installPanel').hidden=installed();}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.textContent='MF Board 앱 설치';});
window.addEventListener('appinstalled',()=>{installPrompt=null;document.getElementById('installPanel').hidden=true;});
installButton.onclick=async()=>{
 if(!installPrompt){installHint.textContent='Chrome 오른쪽 위 ⋮ → 홈 화면에 추가 → 설치를 눌러 주세요.';return;}
 const prompt=installPrompt;installPrompt=null;
 try{await prompt.prompt();await prompt.userChoice;}catch{installHint.textContent='Chrome 오른쪽 위 ⋮ → 홈 화면에 추가 → 설치를 눌러 주세요.';}
};
showInstall();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./mf-app-sw.js').catch(()=>{});
