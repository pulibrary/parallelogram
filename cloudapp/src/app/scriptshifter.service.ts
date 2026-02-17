import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { Settings } from './models/settings';
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';


@Injectable({
    providedIn: 'root'
})
export class ScriptShifterService {

    languageList: Array<{code: string, marcCode: string, name: string, has_r2s: boolean, has_s2r: boolean}>

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
          this.languageList.push({code: langList[i], marcCode: res[langList[i]].marc_code, 
            name: res[langList[i]].label, has_r2s: res[langList[i]].has_r2s, has_s2r: res[langList[i]].has_s2r})
         }
       }).catch((err) => {
        this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
        " " + "ScriptShifter" + " " +  
        this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
        this.translate.instant('Translate.ResultsMayNotBeOptimal'))
       })

     }

     public lookupMarcCode(marcCode: string): string {
        var ssLang = ""
        var ssListLen = 9999
        for(var i = 0; i < this.languageList.length; i++) {
          if(this.languageList[i].marcCode != undefined && 
            this.languageList[i].marcCode.includes(marcCode) && 
            this.languageList[i].marcCode.length < ssListLen) {
            ssLang = this.languageList[i].code
            ssListLen = this.languageList[i].marcCode.length
          }
        }
        if(marcCode == 'kor') {
          ssLang = 'korean_nonames'
        }
        return ssLang
     }

     async query(searchTerm: string, lang: string, toroman: boolean = true, capitalize: string = "no_change", options: string = "{}", authToken: string): Promise<string> { 
        let search_term_escaped = JSON.stringify(searchTerm).replace(/\"$/,"").replace(/^\"/,"").normalize("NFC")
        let tdir = (toroman) ? "s2r" : "r2s"
        let ssQueryJSON =  '{"text":"' + search_term_escaped + '", "lang":"' + lang + '", ' +  
          '"t_dir":"' + tdir + '", "options": ' + options + ', "capitalize": "' + capitalize + '"}'
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
            //Fix SS errors in Chinese spacing/punctuation
            if(lang.includes("chinese")) {
              console.log(resultSTR)
              resultSTR = resultSTR.replace(new RegExp(" ([,\\.])",'gu'),"$1 ")
              resultSTR = resultSTR.replace(new RegExp("([0-9])([A-Za-z])",'gu'),"$1 $2")
              console.log(resultSTR)
            }
            resolve(resultSTR)
        }).catch((err) => {
          this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
          " " + "ScriptShifter" + " " +  
          this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
          this.translate.instant('Translate.ResultsMayNotBeOptimal'))
          resolve("")
        })
      })
    }

    getLanguageDirection(lang: string): string {
      let direction = ""
      for(var i = 0; i < this.languageList.length; i++) {
        let lang_i = this.languageList[i]
        if(lang_i.code == lang) {
          if(lang_i.has_r2s) {
            if(lang_i.has_s2r) {
              direction = "both"
            } else {
              direction = "r2s"
            }
          } else if (lang_i.has_s2r) {
            direction = "s2r"
          }
          break
        }
      }
      return direction
    }

    

    async getLanguageOptions(lang: string, authToken: string): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        let options = ""
        this.http.get(Settings.ssLangOptsURL + "/" + lang, {
          headers: new HttpHeaders({
            'X-Proxy-Host': Settings.ssHost,
            'Authorization': 'Bearer ' + authToken,
            'Content-type': 'application/json'
          })
        }).toPromise().then(async (res) => {        
          options = JSON.stringify(res['options'])   
          if(options == undefined) {
            options = "[]"
          }       
          resolve(options)
        }).catch((err) => {
          resolve("")
        })
      })
    }

     public getLanguageList() {
        return this.languageList
     }
}