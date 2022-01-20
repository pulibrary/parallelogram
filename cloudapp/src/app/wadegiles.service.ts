import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WadegilesService {

  wadegiles: Map<string,string>;
  ready: Promise<boolean>;

  constructor(private http: HttpClient) { 
    this.loadXML();
  }

  loadXML(): void
  {
    this.ready = new Promise((resolve) => {
    this.http.get('assets/wadegiles.xml', {  
      headers: new HttpHeaders()  
        .set('Content-Type', 'text/xml')  
        .append('Access-Control-Allow-Methods', 'GET')  
        .append('Access-Control-Allow-Origin', '*')  
        .append('Access-Control-Allow-Headers', "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Access-Control-Request-Method"),
        responseType: 'text'  
    }).toPromise().then(data => {
      this.wadegiles = this.parseXML(data);
      resolve(true);
    });
  });
  }
      
  parseXML(data: string) : Map<string,string> {  
    let m = new Map<string,string>()
    const doc = new DOMParser().parseFromString(data, "application/xml");
    let entries = doc.getElementsByTagName("romanization");
    for(let i = 0; i < entries.length; i++) {
      m.set(entries[i].getAttribute("wadegiles"),entries[i].getAttribute("pinyin"));
    }
    return m
  }  

  WGLookup(wgstr: string) : string {
    wgstr = wgstr.replace(/[\p{Pf}\p{Pi}\u02BB]/gu, "'");
    wgstr = wgstr.replace(/ü/g,"ü");

    if(this.wadegiles.has(wgstr)) {
      return this.wadegiles.get(wgstr);
    } else {
      return wgstr;
    }
  }

  WGtoPY(wgstr: string) : string {
    wgstr = wgstr.toLowerCase();
    let wgs: string[] = wgstr.split(/([^\s\p{Pd}\p{Pc}\p{Ps}\p{Pe}]+)/u);
    for (let i = 0; i < wgs.length; i++) {
      if (wgs[i].match(/[a-z]/)) {      
        let lookup = this.WGLookup(wgs[i]);
        if (lookup != "") {
          wgs[i] = lookup;
        }
      }
    }
    let result = wgs.join("");
    result = result.replace(/-/g,"");
    return result;
  }
}
