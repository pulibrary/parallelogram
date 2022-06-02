import { config, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Component, OnInit } from '@angular/core';
import { AppService } from '../app.service';
import { FormGroup, FormControl } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AlertService, CloudAppSettingsService, FormGroupUtil, 
  CloudAppEventsService, CloudAppConfigService, CloudAppRestService } from '@exlibris/exl-cloudapp-angular-lib';
import { Settings } from '../models/settings';
import {MatChipInputEvent} from '@angular/material/chips'
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  form: FormGroup;
  saving = false;
  running = false;
  wcKeyValid = false;
  admin: Observable<boolean>;
  hideWCKey = false

  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  languages = [
    {code: 'en', name: 'English'},
    {code: 'zh-CN', name: '中文简体'},
    {code: 'jp', name: '日本語'},
    {code: 'kr', name: '한국어'}
  ]

  constructor(
    private appService: AppService,
    private settingsService: CloudAppSettingsService,
    private eventsService: CloudAppEventsService,
    private configService: CloudAppConfigService,
    private translate: TranslateService,
    private restService: CloudAppRestService,
    private alert: AlertService,
    private http: HttpClient,
  ) { }

  canDeactivate(): Observable<boolean> | boolean {
    if(this.form.dirty) {
      return confirm(this.translate.instant('Translate.ConfirmClose'));
    }    
    return true;
  }	

  setLang(lang: string) {
    this.translate.use(lang)
  }

  ngOnInit() {    
    this.translate.get('Translate.Settings').subscribe(title => this.appService.setTitle(title));
    this.settingsService.get().subscribe( settings => {
      this.form = FormGroupUtil.toFormGroup(Object.assign(new Settings(), settings))   
      this.admin = this.isAdmin(); 
      if(!settings.interfaceLang) {
        this.setLang("en")
        this.form.get("interfaceLang").setValue("en")
      }
      this.form.get("doSwap").valueChanges.subscribe(v => {
        if(v) {
          this.form.get("swapType").enable()
        } else {
          this.form.get("swapType").disable()
        }
      }) 
      this.form.get("adminWC").valueChanges.subscribe(v => {
        if(v) {
          this.form.get("adminLock").enable()
        } else {
          this.form.get("adminLock").disable()
        }
      })  
      this.configService.get().subscribe(fg => {         
        let adminKey: string = fg.wckey
        let adminLock: boolean = fg.adminLock
        if((adminKey != undefined && adminKey != "")) {
          if(settings.wckey == undefined || settings.wckey == "") {
            this.alert.info(this.translate.instant("Translate.AdminSetWCAPI"),{autoClose: false})
          }
          this.form.get('wckey').setValue(adminKey)
          settings.wckey = adminKey
          
          this.form.markAsDirty();        
        }
        this.hideWCKey = (adminLock && adminKey != undefined && adminKey != "")
        this.admin.subscribe(v => {
          if(v) {
            this.hideWCKey = false         
          }
        })           
      },
      (err) => this.alert.error(err),
       () => {         
          if((settings.wckey == undefined || settings.wckey == "") && !settings.pinyinonly) {
            this.alert.warn(this.translate.instant("Translate.NoWCAPI"))
          }
        });
    });    
  }

  addPreSearchField(event: MatChipInputEvent) {
    let tag = (event.value || '').trim()
    if(tag == "") {
      return
    }
    if(tag.length != 3 || !tag.match(/[0-9][0-9Xx][0-9Xx]/)) {
      this.alert.clear()
      this.alert.warn(this.translate.instant("Translate.InvalidTagFormat"))
    } else {
      this.alert.clear()
      tag = tag.toLowerCase()
      let preSearchList: Array<string> = this.form.get("preSearchList").value
      if(!preSearchList.includes(tag)) {
        preSearchList.push(tag)
        preSearchList.sort()
        this.form.markAsDirty()
      }
    }
    event.input.value = ""
  }

  deletePreSearchField(tag: string) {
    let preSearchList: Array<string> = this.form.get("preSearchList").value
    if(tag != undefined) {
      let found = preSearchList.indexOf(tag)
      if(found > -1) {
         preSearchList.splice(found,1)
         this.form.markAsDirty()
      }
    }
  }

  addPreferredInstitution(event: MatChipInputEvent) {
    let code = (event.value || '').trim()
    if(code == "") {
      return
    }
    this.alert.clear()
    let preferredInstitutionList: Array<string> = this.form.get("preferredInstitutionList").value
    if(!preferredInstitutionList.includes(code)) {
      preferredInstitutionList.push(code)
      preferredInstitutionList.sort()
      this.form.markAsDirty()
    }
    event.input.value = ""
  }

  deletePreferredInstitution(code: string) {
    let preferredInstitutionList: Array<string> = this.form.get("preferredInstitutionList").value
    if(code != undefined) {
      let found = preferredInstitutionList.indexOf(code)
      if(found > -1) {
         preferredInstitutionList.splice(found,1)
         this.form.markAsDirty()
      }
    }
  }

  isAdmin(): Observable<boolean> {
    return this.eventsService.getInitData().pipe(
      switchMap( initData => this.restService.call(`/users/${initData.user.primaryId}`)),
      map( user => {
        if (!user.user_role.some(role=>role.role_type.value=='205')) { //Catalog Administrator
          return false;
        }
        return true;
      })
    );
  }

  async save() {
    this.alert.clear()
    this.saving = true;
    let wcKey = this.form.get("wckey").value;   
    let adminLock = this.form.get("adminLock").value 
    if(this.form.get("pinyinonly").value && (wcKey == undefined || wcKey == "")) {
      this.settingsService.set(this.form.value).subscribe(
        response => {
          if(this.form.get("adminWC").value) {
            let configForm: FormGroup = new FormGroup({
              wckey: new FormControl(wcKey),
              adminLock: new FormControl(adminLock)
            })            
            this.configService.set(configForm.value).subscribe()
          }
          this.alert.success(this.translate.instant("Translate.SettingsSaved"));
          this.form.markAsPristine();
        },
        (err) => this.alert.error(err.message),
        ()  => this.saving = false
      );
      return;
    }
    await this.validateWCkey(wcKey);
    if(this.wcKeyValid) { 
      if(this.form.get("adminWC").value) {
        let configForm: FormGroup = new FormGroup({
          wckey: new FormControl(wcKey),
          adminLock: new FormControl(adminLock)
        })
        this.configService.set(configForm.value).subscribe()
      }
      this.settingsService.set(this.form.value).subscribe(
        response => {
          this.alert.success(this.translate.instant("Translate.WCAPIValid") + ". " + 
            this.translate.instant("Translate.SettingsSaved"));
          this.form.markAsPristine();          
        },
        err => this.alert.error(err.message),
        ()  => this.saving = false
      );
    } else {
      this.alert.error(this.translate.instant("Translate.WCAPIInvalid"));
      this.saving = false;
    }
  }

  public async validateWCkey(wcKey: String) {
    let wcURL = Settings.wcBaseURL;
    let authToken = await this.eventsService.getAuthToken().toPromise();
    await this.http.get(wcURL, {
      headers: new HttpHeaders({
        'X-Proxy-Host': 'worldcat.org',
        'wskey': wcKey.toString(),
        'Authorization': 'Bearer ' + authToken,
        'Content-type': 'application/xml'
        }),
      responseType: 'text'
    }).toPromise().then(
      res => {this.wcKeyValid = true}
    ).catch(
      err => {this.wcKeyValid = false}
    )
    this.running = true;
  }
}
