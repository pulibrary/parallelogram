import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RelatorTermsService {

  relator_terms: Map<string,string>;
  relator_keys_pinyin: string[];
  ready: Promise<boolean>;

  constructor(private http: HttpClient) { 
    this.loadXML();
  }

  loadXML(): void
  {
    this.ready = new Promise((resolve) => {
    this.http.get('assets/relator_terms.xml', {  
      headers: new HttpHeaders()  
        .set('Content-Type', 'text/xml')  
        .append('Access-Control-Allow-Methods', 'GET')  
        .append('Access-Control-Allow-Origin', '*')  
        .append('Access-Control-Allow-Headers', "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Access-Control-Request-Method"),
        responseType: 'text'  
    }).toPromise().then(data => {
      this.relator_terms = this.parseXML(data);
      this.relator_keys_pinyin = new Array<string>();
      for(let rtk in this.relator_terms.keys) {
        if(rtk.match(/[a-z]/)) {
          this.relator_keys_pinyin.push(rtk);
        }
      }
      resolve(true);
    });
  });
  }
      
  parseXML(data: string) : Map<string,string> {  
    let m = new Map<string,string>()
    const doc = new DOMParser().parseFromString(data, "application/xml");
    let entries = doc.getElementsByTagName("romanization");
    for(let i = 0; i < entries.length; i++) {
      let cjk = entries[i].getAttribute("cjk");
      let cjk2 = entries[i].getAttribute("cjk2");
      let roman = entries[i].getAttribute("roman");
      if(!m.has(cjk)) {
        m.set(cjk,roman);
      }
      if(cjk2 != undefined && !m.has(cjk2)) {
        m.set(cjk2,roman);
      }
      if(!m.has(roman)) {
        if(cjk2 == undefined) {
          m.set(roman, cjk);
        } else {
          m.set(roman, cjk + "|" + cjk2);
        }
      }
    }

    return m
  }  

  lookup(rtstr: string) : string {
    rtstr = rtstr.replace(/[\p{Pf}\p{Pi}\u02BB]/gu, "'");
    rtstr = rtstr.replace(/ü/g,"ü");

    if(this.relator_terms.has(rtstr)) {
      return this.relator_terms.get(rtstr);
    } else {
      return rtstr;
    }
  }
}
