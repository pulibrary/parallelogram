import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { Settings } from './models/settings';
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';


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
            case 'hindi':
              marcCode = 'hin'
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

     async query(searchTerm: string, lang: string, authToken: string): Promise<string> {
        let search_term_escaped = JSON.stringify(searchTerm).replace(/\"$/,"").replace(/^\"/,"")
        let ssQueryJSON =  '{"text":"' + search_term_escaped + '", "lang":"' + lang + '", ' +  
          '"t_dir": "r2s", "options": {"marc_field":""}}'
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
          this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
          " " + "**SCRIPTSHIFTER**" + " " +  
          this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
          this.translate.instant('Translate.ResultsMayNotBeOptimal'))
          reject("")
        })
      })
    }

     public getLanguageList() {
        return this.languageList
     }
}