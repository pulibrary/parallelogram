import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RelatorTermsService {

  relator_terms: Map<string,string>;
  relator_keys_pinyin: string[];
  ready: Promise<boolean>;

  constructor(private http: HttpClient,
    private alert: AlertService,) { 
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
      this.relator_terms = new Map<string,string>();
      this.relator_keys_pinyin = new Array<string>();   
      this.parseXML(data)      
      resolve(true);
    });
  });
  }
      
  parseXML(data: string) {  
    const doc = new DOMParser().parseFromString(data, "application/xml");
    //this.alert.warn(JSON.stringify(doc.firstElementChild.innerHTML.replace(/</g,"&lt;").replace(/>/g,"&gt;")),{autoClose: false})
    let entries = doc.getElementsByTagName("relatorTerm");
    //this.alert.warn(entries.length+'',{autoClose: false})
    for(let i = 0; i < entries.length; i++) {
      let cjk = entries[i].getAttribute("cjk");
      let cjk2 = entries[i].getAttribute("cjk2");
      let roman = entries[i].getAttribute("roman");
      if(!this.relator_terms.has(cjk)) {
        this.relator_terms.set(cjk,roman);
      }
      if(cjk2 != undefined && !this.relator_terms.has(cjk2)) {
        this.relator_terms.set(cjk2,roman);
      }
      if(!this.relator_terms.has(roman)) {
        if(cjk2 == undefined) {
          this.relator_terms.set(roman, cjk);
        } else {
          this.relator_terms.set(roman, cjk + "|" + cjk2);
        }
      }
      if(!this.relator_keys_pinyin.includes(roman)) {
        this.relator_keys_pinyin.push(roman)
      }
    }
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
