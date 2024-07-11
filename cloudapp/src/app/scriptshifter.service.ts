import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { Settings } from './models/settings';
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { L } from '@angular/cdk/keycodes';


@Injectable({
    providedIn: 'root'
})
export class ScriptShifterService {

    languageList: Array<{code: string, marcCode: string, name: string}>

    constructor(private http: HttpClient,
                private alert: AlertService,
                private translate: TranslateService
    ) {

    }
    public loadLanguageList(authToken: string): Promise<void> {
        return this.http.get(Settings.ssLangURL, {
         headers: new HttpHeaders({
           'X-Proxy-Host': Settings.ssHost,
           'Authorization': 'Bearer ' + authToken,
           'Content-type': 'application/json'
         }),
         responseType: "json"
       }).toPromise().then((res) => {
         this.languageList = new Array()
         var langList: Array<string> = Object.keys(res)
         for(var i = 0 ; i < langList.length; i++) {
          var marcCode = ""
          switch(langList[i]) {
            case 'chinese':
              marcCode = 'chi'
              break
            case 'hindi':
              marcCode = 'hin'
              break
            case 'thai':
              marcCode = 'tha'
              break
            case 'tibetan':
              marcCode = "tib"
              break
            case 'uighur_cyrillic':
              marcCode = 'uig'
              break
            case 'mongolian_cyrillic':
              marcCode = 'mon'
              break
            case 'korean_nonames':
              marcCode = 'kor'
              break
            case 'burmese':
              marcCode = 'bur'
              break
            case 'arabic':
              marcCode = 'ara'
              break
            case 'persian':
              marcCode = 'per'
              break
            case 'hebrew':
              marcCode = 'heb'
              break
            case 'georgian': 
              marcCode = 'geo'
              break
          }
          this.languageList.push({code: langList[i], marcCode: marcCode, name: res[langList[i]].name})
         }
       }).catch((err) => {
        this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
        " " + "**SCRIPTSHIFTER**" + " " +  
        this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
        this.translate.instant('Translate.ResultsMayNotBeOptimal'))
       })
     }

     public lookupMarcCode(marcCode: string): string {
        var ssLang = ""
        for(var i = 0; i < this.languageList.length; i++) {
          if(this.languageList[i].marcCode == marcCode) {
            ssLang = this.languageList[i].code
            break
          }
        }
        return ssLang
     }

     async query(searchTerm: string, lang: string, toroman: boolean = true, authToken: string): Promise<string> {
        let search_term_escaped = JSON.stringify(searchTerm).replace(/\"$/,"").replace(/^\"/,"")
        let tdir = (toroman) ? "s2r" : "r2s"
        let ssQueryJSON =  '{"text":"' + search_term_escaped + '", "lang":"' + lang + '", ' +  
          '"t_dir":"' + tdir + '", "options": {"marc_field":""}}'
        let ssURL = Settings.ssBaseURL
        return new Promise<string>((resolve, reject) => {
            this.http.post(ssURL, ssQueryJSON, {
              headers: new HttpHeaders({
                'X-Proxy-Host': Settings.ssHost,
                'Authorization': 'Bearer ' + authToken,
                'Content-type': 'application/json'
            })
            }).toPromise().then(async (res) => {
            var resOBJ = JSON.parse(JSON.stringify(res))
            var resultSTR = resOBJ.output;
            resolve(resultSTR)
        }).catch((err) => {
          //this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
          //" " + "**SCRIPTSHIFTER**" + " " +  
          //this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
          //this.translate.instant('Translate.ResultsMayNotBeOptimal'))
          resolve("")
        })
      })
    }

     public getLanguageList() {
        return this.languageList
     }
}