import { useId, useState, type InputHTMLAttributes } from 'react';
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
 const [visible,setVisible]=useState(false); const generated=useId(); const id=props.id ?? generated;
 return <span><input {...props} id={id} type={visible?'text':'password'}/><button type="button" aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} aria-controls={id} onClick={()=>setVisible(v=>!v)}>{visible?'Ocultar':'Mostrar'}</button></span>;
}
export const passwordIssue=(password:string,confirm:string)=>password!==confirm?'Las contraseñas no coinciden.':password.length<12?'La contraseña debe tener al menos 12 caracteres.':new TextEncoder().encode(password).length>72?'La contraseña no puede superar 72 bytes UTF-8.':'';
