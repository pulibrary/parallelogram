import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Component, EventEmitter, OnInit } from '@angular/core';
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
import { Router } from '@angular/router';
import { USE_STORE } from '@ngx-translate/core';

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

  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

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
      return confirm('Unsaved changes will be lost.  Are you sure you want to leave this page?');
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
      //this.alert.info(JSON.stringify(this.form.value),{autoClose: false})
      this.admin = this.isAdmin(); 
      this.form.get("doSwap").valueChanges.subscribe(v => {
        if(v) {
          this.form.get("swapType").enable()
        } else {
          this.form.get("swapType").disable()
        }
      })      
      if(settings.wckey == undefined) {
        this.configService.get().subscribe(fg => {          
          let adminKey: string = fg.wckey
          if(adminKey != undefined) {
            //this.alert.success(fg.wckey,{autoClose: false})
            this.form.get('wckey').setValue(adminKey)
            settings.wckey = adminKey
            this.alert.info("WorldCat API Key has been set by the Administrator.",{autoClose: false})
            this.form.markAsDirty();        
          }           
        },
        (err) => this.alert.error(err),
       () => {         
          if(settings.wckey == undefined && !settings.pinyinonly) {
            this.alert.warn("No WorldCat API Key has been entered.")
          }
        });
      }
    });    
  }

  addPreSearchField(event: MatChipInputEvent) {
    let tag = (event.value || '').trim()
    if(tag == "") {
      return
    }
    if(tag.length != 3 || !tag.match(/[0-9][0-9Xx][0-9Xx]/)) {
      this.alert.clear()
      this.alert.warn("Invalid tag format")
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
    //this.alert.info(tag)
    let preSearchList: Array<string> = this.form.get("preSearchList").value
    if(tag != undefined) {
      let found = preSearchList.indexOf(tag)
      if(found > -1) {
         preSearchList.splice(found,1)
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
    //this.alert.info(JSON.stringify(this.form.value) + "*",{autoClose: false})
    let wcKey = this.form.get("wckey").value;    
    //this.alert.info(JSON.stringify(this.form.get("pinyinonly").value));
    if(this.form.get("pinyinonly").value) {
      this.settingsService.set(this.form.value).subscribe(
        response => {
          this.alert.success('Settings successfully saved.');
          this.form.markAsPristine();
        },
        (err) => this.alert.error(err.message),
        ()  => this.saving = false
      );
      return;
    }
    await this.validateWCkey(wcKey);
    //this.alert.info(this.wcKeyValid+"",{autoClose: false})
    if(this.wcKeyValid) { 
      if(this.form.get("adminWC").value) {
        //this.alert.info("config")
        let configForm: FormGroup = new FormGroup({wckey: new FormControl(wcKey)})
        
        this.configService.set(configForm.value).subscribe(
          res => {
            this.configService.get().subscribe(v => {
              //this.alert.success(JSON.stringify(v));
            });
          },
          err => {this.alert.error("Could not write config")}
        );
        
      }
      this.settingsService.set(this.form.value).subscribe(
        response => {
          this.alert.success('WorldCat API Key Valid. Settings successfully saved.');
          this.form.markAsPristine();
        },
        err => this.alert.error(err.message),
        ()  => this.saving = false
      );
    } else {
      this.alert.error("WorldCat API Key Not Valid.");
      this.saving = false;
    }
  }

  public async validateWCkey(wcKey: String) {
    let wcURL = Settings.wcBaseURL;
    let authToken = await this.eventsService.getAuthToken().toPromise();
    //this.alert.info(authToken,{autoClose: false})
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
