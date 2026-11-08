import {useEffect,useRef,useState} from 'react';
let loading;
function load(){if(window.grecaptcha?.render)return Promise.resolve();if(!loading)loading=new Promise((resolve,reject)=>{window.dormfindCaptchaReady=resolve;const s=document.createElement('script');s.src='https://www.google.com/recaptcha/api.js?onload=dormfindCaptchaReady&render=explicit';s.async=true;s.defer=true;s.onerror=()=>reject(new Error('Could not load reCAPTCHA. Check your internet connection.'));document.head.appendChild(s);});return loading;}
export default function Captcha({config,onToken,reset}){
 const el=useRef(),widget=useRef(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;if(config.local_captcha_bypass){onToken('local-development');return;}if(!config.recaptcha_site_key)return;
 load().then(()=>{if(active && widget.current===null)widget.current=window.grecaptcha.render(el.current,{sitekey:config.recaptcha_site_key,callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>{onToken('');setError('reCAPTCHA failed. Please refresh.');}});}).catch(e=>setError(e.message));return()=>{active=false;};},[config]);
 useEffect(()=>{if(widget.current!==null && window.grecaptcha){window.grecaptcha.reset(widget.current);onToken('');}},[reset]);
 if(config.local_captcha_bypass)return <small className="notice">Local development: reCAPTCHA bypass is enabled.</small>;
 if(!config.recaptcha_site_key)return <p className="notice">Account access needs reCAPTCHA keys configured in the backend .env.</p>;
 return <><div ref={el}/>{error && <p className="error">{error}</p>}</>;
}
