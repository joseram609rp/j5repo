import { useId, useState, type InputHTMLAttributes } from 'react';
import { suggestions } from './vehicle-catalog';
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; values: string[]; onValue: (value:string)=>void };
export function CatalogInput({value,values,onValue,...props}: Props) {
 const id=useId(); const [focused,setFocused]=useState(false); const [dismissed,setDismissed]=useState(false); const [selected,setSelected]=useState(-1);
 const options=focused && !dismissed && !props.disabled ? suggestions(values,value) : [];
 const choose=(next:string)=>{onValue(next);setDismissed(true);setSelected(-1);};
 return <span className="catalog-input"><input {...props} value={value} role="combobox" aria-autocomplete="list" aria-expanded={options.length>0} aria-controls={id} aria-activedescendant={selected>=0 && options[selected] ? id+'-'+selected : undefined} autoComplete="off"
  onFocus={()=>{setFocused(true);setDismissed(false);}} onBlur={e=>{setFocused(false);setSelected(-1);props.onBlur?.(e);}}
  onChange={e=>{onValue(e.target.value);setDismissed(false);setSelected(-1);}}
  onKeyDown={e=>{if(e.key==='Escape'){setDismissed(true);setSelected(-1);} else if(options.length && ['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setSelected(i=>e.key==='ArrowDown'?(i+1)%options.length:(i<=0?options.length-1:i-1));} else if(e.key==='Enter' && selected>=0 && options[selected]){e.preventDefault();choose(options[selected]!);} props.onKeyDown?.(e);}}
 />{options.length>0 && <span id={id} role="listbox" className="catalog-options">{options.map((option,i)=><span key={option} id={id+'-'+i} role="option" aria-selected={i===selected} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(option)}>{option}</span>)}</span>}</span>;
}
