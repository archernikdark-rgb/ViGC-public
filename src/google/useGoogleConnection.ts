import { useEffect, useRef, useState } from 'react';
import { GoogleConnection } from './connection.ts';
import { browserGoogleGateway } from './browser.ts';
export function useGoogleConnection(){
 const [state,setState]=useState<GoogleConnection['state']>({status:'loading',selection:null,sheets:[],message:''});
 const ref=useRef<GoogleConnection|null>(null);
 if(!ref.current){const config={clientId:import.meta.env.VITE_GOOGLE_CLIENT_ID??'',apiKey:import.meta.env.VITE_GOOGLE_API_KEY??'',appId:import.meta.env.VITE_GOOGLE_APP_ID??''};ref.current=new GoogleConnection(config,browserGoogleGateway(config),Date.now,setState);}
 const connection=ref.current;
 useEffect(()=>{void connection.prepare();const timer=window.setInterval(()=>connection.checkExpiry(),1000);return ()=>clearInterval(timer);},[connection]);
 return {state,connection};
}
