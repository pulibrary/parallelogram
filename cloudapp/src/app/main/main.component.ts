import { forkJoin, interval, Observable, Subscription } from 'rxjs';
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod, CloudAppSettingsService,
  Entity, EntityType, PageInfo, RestErrorResponse, AlertService, CloudAppConfigService, 
  CloudAppStoreService,
  InitData,
} from '@exlibris/exl-cloudapp-angular-lib';
import { Bib, BibUtils } from './bib-utils';
import { AuthUtils } from './auth-utils'
import { DictEntry } from './dict-entry'
import { from } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Settings } from '../models/settings';
import { OclcQuery } from './oclc-query';
import { MarcDataField } from './marc-datafield';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker';
import { AppService } from '../app.service'
import { take, finalize, timeout } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialog } from './confirmation-dialog';
import { ScriptShifterService } from '../scriptshifter.service';
import { P } from '@angular/cdk/keycodes';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})

export class MainComponent implements OnInit, OnDestroy {
  private pageLoad$: Subscription;
  pageEntities: Entity[];
  private _apiResult: any;
  initData: InitData
  defaultLang: string
  ssLangDirection = "both"
  ssMarcSensitive = false

  hasApiResult: boolean = false;
  loading = false;
  saving = false;
  recordChanged = false;
  completedSearches = 0;
  totalSearches = 0;
  bibUtils: BibUtils;
  authUtils: AuthUtils;
  settings: Settings;
  doPresearch: boolean;
  bib: Bib;
  mms_id: string;
  languageCode: string;
  fieldTable: Map<string,MarcDataField>;
  parallelDict: Array<DictEntry>;
  subfield_options: Map<string, Map<string, Array<string>>>;
  statusString: string = "";
  doSearch: boolean = true;
  searchProgress: number = 0;
  showDetails = ""
  authToken = ""
  authToken_ready: Promise<string>
  access_token = null
  warnedTimeout = false
  warnedAPI = false

  deletions: Array<{key: string,value: string}>;
  
  preSearchArray: Array<string>
  preSearchFields: Map<string,boolean>;
  fieldCache: Map<string,Map<string,Array<string>>>
  linkedDataCache: Array<string>
  preferredWCscore = 10
  preferredLOCscore = 5
  dictMax = 200

  ssLanguages: Array<{code: string, name: string}>
  defaultSSScore = 1

  punctuationPattern = "[^\\P{P}\\p{Ps}\\p{Pe}\\p{Pi}\\p{Pf}\"\"\'\']";
  punctuation_re = new RegExp(this.punctuationPattern,"u");
  delimiterPattern = "(?:\\s|" + this.punctuationPattern + ")*(?:(?:\\$.)|[:;\\/=])+(?:\\s|" 
    + this.punctuationPattern + ")*";
  delimiter_re = new RegExp(this.delimiterPattern,"u");
  etalPattern = "(\\[?(\\.\\.\\.)? ?((\\[?(et al\\.?)|( and others)\\]?)))";
  etal_re = new RegExp(this.etalPattern,"u");
  cjkPattern = "[\\p{sc=Han}]";
  cjk_re = new RegExp(this.cjkPattern,"u");

  @ViewChild('marcRecord',{static: false}) marcRecordTable: ElementRef;  

  constructor(private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private settingsService: CloudAppSettingsService,
    private translate: TranslateService,
    private appService: AppService,
    private configService: CloudAppConfigService,
    private alert: AlertService,
    private storeService: CloudAppStoreService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private scriptshifter: ScriptShifterService,
    private router: Router,
    public dialog: MatDialog) { }

  canDeactivate(): Observable<boolean> | boolean {
    if(this.recordChanged) {
      const dialogRef = this.dialog.open(ConfirmationDialog, { autoFocus: false,
           data: {
            msg: this.translate.instant("Translate.ConfirmClose"),
            yesString: this.translate.instant("Translate.Yes"),
            noString: this.translate.instant("Translate.No")
          } 
        });
      return dialogRef.afterClosed()
    }    
    return true;
  }	

  ngOnInit() {   
    this.settingsService.get().subscribe(stgs => {
      this.settings = stgs as Settings;
      if(this.settings.interfaceLang == undefined) {
        this.settings.interfaceLang = "eng"
      } 
      if(this.settings.ssLang == undefined) {
        this.settings.ssLang = "None"
      } 
      if(this.settings.autoSelectSSLang == undefined) {
        this.settings.autoSelectSSLang = true
      } 
      this.translate.use(this.settings.interfaceLang) 
      this.configService.get().subscribe(cfg => {  
        let adminKey: string = cfg.wckey
        let adminSecret: string = cfg.wcsecret
        if((adminKey != undefined && adminKey != "")) {   
          this.settings.wckey = adminKey
          this.settings.wcsecret = adminSecret      
        }          
      },
      (err) => this.alert.error(err),
      () => {              
        this.doPresearch = this.settings.doPresearch; 
        //if "pinyin only setting" from previous version is unset and wc key/secret exists,
        //then enable WC searching
        if(this.settings.doWCSearch === undefined) {
          this.settings.doWCSearch = !this.settings.pinyinonly
        }    
        if(!this.settings.doWCSearch) {
          this.doSearch = false
        } 
        this.preSearchArray = this.settings.preSearchList
        if(this.settings.interfaceLang == "") {
          this.eventsService.getInitData().subscribe(data=> {
            this.initData = data
            this.settings.interfaceLang = this.initData.lang      
          });
        }
      });        
    });
     
    this.parallelDict = new Array<DictEntry>();    
    this.subfield_options = new Map<string, Map<string, Array<string>>>();
    this.deletions = new Array<{key: string,value: string}>();
    this.preSearchFields = new Map<string,boolean>()   
    this.authToken_ready = this.eventsService.getAuthToken().toPromise()
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);

  }

  ngOnDestroy(): void {
    this.pageLoad$.unsubscribe();
  }

  get apiResult() {
    return this._apiResult;
  }

  set apiResult(result: any) {
    this._apiResult = result;
    this.hasApiResult = result && Object.keys(result).length > 0;
  }

  async setSSLanguage(lang: string) {
    if(lang == "auto-select") {
      var autoLang = this.scriptshifter.lookupMarcCode(this.languageCode)
      if(autoLang == "") {
        lang = this.settings.ssLang
      } else {
        lang = autoLang
      }
    }
    this.settings.ssLang = lang
    this.ssLangDirection = this.scriptshifter.getLanguageDirection(lang) 
    var langOptions = await this.scriptshifter.getLanguageOptions(lang, this.authToken)
    this.ssMarcSensitive = langOptions.includes("marc_field")
    this.fieldCache.clear()
    this.performPresearch()
    this.defaultSSScore += 3
  }

  changeSpinner(state: string) {
    if(state == "loading") {
      this.saving = false
      this.loading = true
    } else if(state == "saving") {
      this.saving = true
      this.loading = false
    } else if (state == "clear") {
      this.saving = false
      this.loading = false 
    }
  }

  onPageLoad = (pageInfo: PageInfo) => {    
    if(this.route.snapshot.queryParamMap.has('doSearch') && this.doSearch) {
      this.doSearch = (this.route.snapshot.queryParamMap.get('doSearch') == "true")
    }

    this.authToken_ready.then(async (aut) => {
    this.authToken = aut    
    if(this.ssLanguages == undefined) {
      this.scriptshifter.loadLanguageList(this.authToken).then(() => {
        this.ssLanguages = Object.assign([], this.scriptshifter.getLanguageList())
        this.ssLanguages.unshift({code: "auto-select", name: "Auto-select"})
        this.ssLanguages.unshift({code: "none",name: "None"})
      })
    }

    this.bibUtils = new BibUtils(this.restService,this.alert);
    this.authUtils = new AuthUtils(this.http)
    if(this.doSearch) {
      this.access_token = await this.authUtils.getOAuthToken(
          this.authToken,this.settings.wckey,this.settings.wcsecret)
    }
    this.fieldCache = new Map<string,Map<string,Array<string>>>()   
    this.linkedDataCache = new Array<string>()


    this.pageEntities = (pageInfo.entities||[]).filter(e=>[EntityType.BIB_MMS, 'IEP', 'BIB'].includes(e.type));
    if ((pageInfo.entities || []).length >= 1) {
      const entity = pageInfo.entities[0];
      this.bibUtils.getBib(entity.id).subscribe(bib=> {
        this.bib = null;
        if(bib.record_format=='marc21') {
          if(pageInfo.entities.length > 1) {
            this.alert.warn(this.translate.instant("Translate.OneRecordWarning"))
          }
          this.bib = bib;
          this.languageCode = this.bibUtils.getLanguageCode(bib)
          if(this.settings.autoSelectSSLang) {
            this.setSSLanguage("auto-select")            
          }
          this.mms_id = bib.mms_id;
          this.extractParallelFields(this.bib.anies);
          this.fieldTable = this.bibUtils.getDatafields(bib);
          if(this.doSearch && this.settings.wckey != undefined && this.settings.wcsecret != undefined) {            
            this.changeSpinner("loading")
            let oclcQueries: Array<OclcQuery> = [];
            this.bib.lccns = this.bibUtils.getBibField(bib,"010","a").trim();
            if(this.bib.lccns != "") {oclcQueries.push(new OclcQuery("dn", "exact",this.bib.lccns))}
            this.bib.isbns = this.bibUtils.getBibField(bib,"020","a").trim();
            this.bib.isbns = this.bib.isbns.replace("-","").replace(RegExp("\\s*\\([^\\(]*\\)\\s*\\p{P}*","u"),"")
            if(this.bib.isbns != "") {
              oclcQueries.push(new OclcQuery("bn","any",this.bib.isbns))
            }
            this.bib.issns = this.bibUtils.getBibField(bib,"022","a").trim();
            this.bib.issns = this.bib.issns.replace("-","").replace(RegExp("\\s*\\([^\\(]*\\)\\s*\\p{P}*","u"),"")
            if(this.bib.issns != "") {
              oclcQueries.push(new OclcQuery("in","any",this.bib.issns))
            }
            this.bib.oclcnos = this.bibUtils.extractOCLCnums(this.bibUtils.getBibField(bib,"035","a")).trim();
            if(this.bib.oclcnos != "") {oclcQueries.push(new OclcQuery("no","any",this.bib.oclcnos))}
            this.bib.title = this.bibUtils.getBibField(bib,"245","a").trim();
            let [t1,t2] = this.bib.title.split(/\s*=\s*/,2);
            if(!t2) {
              [t1,t2] = this.bib.title.split(/\s*\(/,2);
              if(t2) {
                t2 = t2.replace(new RegExp("[\\p{P}\\s]*$",'u'),"");
              }
            }
            let titles = [this.bib.title];
                        
            if(t2) {
              titles.push(t1,t2);
            }            
            this.bib.names = this.bibUtils.getBibField(bib,"100","a".trim()) + "|" + 
              this.bibUtils.getBibField(bib,"700","a").trim();
            this.bib.names = this.bib.names.replace(new RegExp("^\\\|"),"")
              .replace(new RegExp("\\\|$"),"");

            let names = this.bib.names.split("\|").filter((item,index) => this.bib.names.indexOf(item)== index);

            titles.forEach(title => {         
              title = title.replace(new RegExp("[\\p{P}\\s]+$",'u'),"")        
              names.forEach( name => {
                name = name.replace(new RegExp("[\\p{P}\\s]+$",'u'),"") 
                if(name == "") {
                  return;
                }
                
                let tnq = new OclcQuery("ti","exact",title);
                tnq.addParams("au","=",name);
                oclcQueries.push(tnq);              
              });
              oclcQueries.push(new OclcQuery("ti","exact",title));
            });
            if(oclcQueries.length > 0) {
              this.completedSearches = 0;  
              this.totalSearches = oclcQueries.length;
              if(this.totalSearches > 0) {
                this.changeSpinner("loading")
               this.statusString = this.translate.instant('Translate.Searching') + " WorldCat: 0%";
              }     
              this.warnedTimeout = false
              interval(500).pipe(take(oclcQueries.length)).subscribe(oq => {
                this.getOCLCrecords(oclcQueries[oq])
              },
              (err) => {},
              async () => {
                this.performPresearch()
              })   
            }
         } else {
           this.performPresearch()
         }
        }
      })
    } else {
      this.apiResult = {};
    }
  });
  setTimeout(() => {
    if(document.getElementById("noRecord")) {
      return document.getElementById("noRecord").removeAttribute("hidden");this.changeSpinner("clear")}
    },
    3000)
  }

  async performPresearch() {
    if(this.settings.doPresearch) {  
      this.changeSpinner("saving")  
      for(let i = 0; i < this.preSearchArray.length; i++) {       
        let f = this.preSearchArray[i]     
        f = f.replace(/[Xx]*$/,"")
        let comp = 0
        if(f.length == 2) {
          comp = 10
        }
        if(f.length == 1) {
          comp = 100
        }             
        if(comp > 0) {
          for(let j = 0; j < comp; j++) {
            let pad = (f.length == 1 && j < 10) ? "0" : ""
            let fj = f+pad+j               
            for(let k = 0; this.fieldTable.has(fj+":"+(k < 10 ? "0" + k : k)); k++) {  
              this.statusString = this.translate.instant('Translate.Presearching') + ": " + 
                this.translate.instant('Translate.Field') + " "  + fj                  
              await this.lookupField(fj+":"+(k < 10 ? "0" + k : k),true)
            }
          }
        } else {              
          for(let k = 0; this.fieldTable.has(f+":"+(k < 10 ? "0" + k : k)); k++) {
            this.statusString = this.translate.instant('Translate.Presearching') + ": " + 
              this.translate.instant('Translate.Field') + " " + f
            await this.lookupField(f+":"+(k < 10 ? "0" + k : k),true)
          }
        }                
      }              
    }
    this.changeSpinner("clear")
  }

  async getOCLCrecords(oq: OclcQuery) {
    let wcURL:string   
    let wcHeaders: HttpHeaders
    wcURL = Settings.wcMDBaseURL + "?" + Settings.wcMDQueryParamName + "=" +
      oq.getQueryString() +"&limit=50"
    wcHeaders = new HttpHeaders({
      'X-Proxy-Host': Settings.wcMetadataHost,
      'X-Proxy-Auth': 'Bearer ' + this.access_token,
      'Authorization': 'Bearer ' + this.authToken,
      'Accept': 'application/json'
    })
    let retrievedRecords = new Array()
    this.http.get(wcURL, {headers: wcHeaders, responseType: 'text'}).subscribe(
      async (res) => {
        let jsonBrief = JSON.parse(res)                    
        if(jsonBrief["briefRecords"]) {
          let recs = jsonBrief["briefRecords"]
          let wcSingleHeaders = new HttpHeaders({
            'X-Proxy-Host': Settings.wcMetadataHost,
            'X-Proxy-Auth': 'Bearer ' + this.access_token,
            'Authorization': 'Bearer ' + this.authToken,
            'Accept': 'application/marcxml+xml'
          })
          let singleRecRequests:Observable<string>[] = []
          for(let i = 0; i < recs.length; i++) {
            let oclcNo:string = recs[i]["oclcNumber"]
            if(!retrievedRecords.includes(oclcNo)) {
              retrievedRecords.push(oclcNo)
              let wcSingleURL = Settings.wcMDSingleBaseURL + "/" + oclcNo             
              let req = this.http.get(wcSingleURL,{headers: wcSingleHeaders,responseType: "text"})              
              singleRecRequests.push(req)                
            }
          }          
          let results = ""         
          forkJoin(singleRecRequests).pipe(
            timeout(15000),finalize(() => {      
              this.completedSearches++;
              this.searchProgress = Math.floor(this.completedSearches*100/this.totalSearches);
              this.statusString = this.translate.instant('Translate.Searching') + " WorldCat: " + this.searchProgress  + "%";
              if(this.completedSearches == this.totalSearches) {
                this.changeSpinner("saving")          
                this.statusString = this.translate.instant('Translate.AnalyzingRecords') + "... "
                this.addParallelDictToStorage().finally(async () => {   
                  if(!this.doPresearch) {   
                    this.changeSpinner("clear")
                  } 
                })
              }
            }          
          )).subscribe(
            (resps) => {                                   
              results = "<records>\n" + resps.join('') + "\n</records>" 
              results = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" 
                + results.replace(/<\?xml[^>]*>/g,"")             
              this.extractParallelFields(results,true)        
              },
            (err) => {
              if(!this.warnedTimeout) {
              this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
                " " + this.translate.instant('Translate.WorldCatMetadataAPI') + " " + 
                this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
                this.translate.instant('Translate.ResultsMayNotBeOptimal'))
              this.warnedTimeout = true
              }
            },
          )
        }
      }, 
      (err) => {
        if(!this.warnedTimeout) {
          this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
            " " + this.translate.instant('Translate.WorldCatMetadataAPI') + " " + 
            this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
            this.translate.instant('Translate.ResultsMayNotBeOptimal'))
          this.warnedTimeout = true
        }
      },
    )
  }

  async lookupField(fkey: string, presearch = false) {
    this.showDetails = ""
    if(!presearch) {
      this.statusString = ""
    }
    let field = this.fieldTable.get(fkey)
    let placeholder_tag = field.tag
    
    if(placeholder_tag == "880") {
      let t = field.getSubfield("61")
      if(t == "") {
          t = "500"
      }
      placeholder_tag = t.substring(0,3)      
    }
    if(!presearch) {
      field.deleteSubfield("61")
    }
    let parallel_field = new MarcDataField("880",field.ind1,field.ind2);
    let seqno = this.findUnusedLinkage();
    let seq = placeholder_tag + "-" + seqno;
    let seq880 = "880-" + seqno;    
    parallel_field.addSubfield("61","6",seq);

    this.changeSpinner("saving")

    let options_map = new Map<string, Array<string>>()
    let cached_options = this.fieldCache.get(fkey)

    let linkedDataURL = field.subfields.find(a => a.code == "0")
    if(linkedDataURL != undefined && !this.linkedDataCache.includes(linkedDataURL.data)) {
      await this.getLinkedData(linkedDataURL.data)
      this.linkedDataCache.push(linkedDataURL.data)

    }
    for(let j = 0; j < field.subfields.length; j++) {
      let sf = field.subfields[j];
      if(sf.code.match(/[0-9]/) || sf.data.match("/^http:/")) {
        parallel_field.addSubfield(sf.id,sf.code,sf.data)
        continue
      }        
      let options = new Array<string>()
      if(cached_options != undefined && cached_options.has(sf.id)) {
        options = cached_options.get(sf.id)
      } else {   
        var sfdataparts = sf.data.split(new RegExp(this.delimiterPattern,"u"));        
        for(let k = 0; k < sfdataparts.length; k++) {              
          if(sfdataparts[k] != "" && this.settings.ssLang != "none") {
            let ssResult_nonrom = ""
            let ssOptionsObj = JSON.parse(this.settings.ssOptionsValues)
            if(this.ssMarcSensitive) {
              ssOptionsObj['marc_field'] = field.tag
            }
            let ssOptions = JSON.stringify(ssOptionsObj)
            if(this.ssLangDirection != "s2r") {
              ssResult_nonrom = await this.scriptshifter.query(sfdataparts[k], this.settings.ssLang, false, this.settings.ssCapitalize, ssOptions, this.authToken)            
            } 
            let ssResult_roman = ""
            if(this.ssLangDirection != "r2s") {
              ssResult_roman = await this.scriptshifter.query(sfdataparts[k], this.settings.ssLang, true, this.settings.ssCapitalize, ssOptions, this.authToken)      
            } 
            if((ssResult_nonrom != sfdataparts[k] && ssResult_nonrom != "") || (ssResult_roman != sfdataparts[k] && ssResult_roman != "")) {
              let sfdata_norm = this.cjkNormalize(sfdataparts[k])
              if(sfdata_norm != "") {
                let entries = new Array<DictEntry>()
                if(ssResult_nonrom != sfdataparts[k] && ssResult_nonrom != sfdata_norm && ssResult_nonrom != "") {
                  let entries_nonrom = this.addToParallelDict(sfdata_norm, ssResult_nonrom, [sfdataparts[k]], this.defaultSSScore)
                  entries = entries.concat(entries_nonrom)
                }
                if(ssResult_roman != sfdataparts[k] && ssResult_roman != ssResult_nonrom && ssResult_roman != sfdata_norm&& ssResult_roman != "") {
                  let entries_roman = this.addToParallelDict(sfdata_norm, ssResult_roman, [sfdataparts[k]], this.defaultSSScore)
                  entries = entries.concat(entries_roman)
                }
                if(entries != undefined && entries.length > 0) {
                  entries = entries.filter((a, index) => entries.indexOf(a) === index)
                  await this.addToStorage(entries)
                }
              }
            }
          } 
        }  
        options = await this.lookupInDictionary(sf.data);    
      }   
      if(options.length == 0) {
        options = [sf.data]
      }  
      if(presearch && options[0] != sf.data) {
        this.preSearchFields.set(fkey,true)
      }   
      let best = 0  
      let bookends = ""
      if(sf.data.match(new RegExp("^\\p{P}",'u'))) {
        bookends += sf.data.charAt(0)
      }
      if(sf.data.match(new RegExp("\\p{P}$",'u'))) {
        bookends += sf.data.charAt(sf.data.length-1)
      }
      for(let k = 0; k < options.length; k++) {
        let opt_k = options[k]
        let bookends_k = ""
        if(opt_k.match(new RegExp("^\\p{P}",'u'))) {
          bookends_k += opt_k.charAt(0)
        }
        if(opt_k.match(new RegExp("\\p{P}$",'u'))) {
          bookends_k += opt_k.charAt(opt_k.length-1)
        }
        if(bookends == bookends_k) {
          best = k
          break
        }
      }      
      parallel_field.addSubfield(sf.id,sf.code,options[best]) 
      options_map.set(sf.id,options)   
      
    }
    this.changeSpinner("clear")
    if(!presearch) {
      if(field.tag == "880") {
        field.tag = placeholder_tag
      }
      field.addSubfield("61","6",seq880,true);

      this.bibUtils.replaceFieldInBib(this.bib,fkey,field);
      this.bibUtils.addFieldToBib(this.bib,parallel_field); 
      this.fieldTable = this.bibUtils.getDatafields(this.bib)
      if(!fkey.includes(field.tag)) { //field was an 880 converted to a normal field
        for(let i = 0; i < 999; i++) {
          let testKey = field.tag + ":" + (i < 10 ? "0" : "") + i
          if(this.fieldTable.has(testKey)) {
            fkey = testKey
          } else {
            break
          }
        }
      }
      if(this.settings.doSwap) {
        this.doParallelSwap(fkey,field.getSubfieldString(),parallel_field.getSubfieldString())
      }
      this.recordChanged = true;
      this.preSearchFields.delete(fkey)
    }
    this.fieldCache.set(fkey,options_map)      
  }

  doParallelSwap(fkey: string, fdata: string, pfdata: string) {
    let roman_count = (fdata.match(/[A-Za-z]/g) || [] ).length
    let p_roman_count = (pfdata.match(/[A-Za-z]/g) || []).length
    let p_roman = p_roman_count > roman_count
    if((this.settings.swapType == "roman" && !p_roman) ||
      this.settings.swapType == "nonroman" && p_roman) {
        this.swapField(fkey)
    }
  }

  saveRecord() {
    this.statusString= ""
    this.changeSpinner("saving")
    this.extractParallelFields(this.bib.anies)
    this.addParallelDictToStorage()

    this.bibUtils.updateBib(this.bib).subscribe(
      (res) => {
        this.recordChanged = false;
        this.alert.success(this.translate.instant('Translate.RecordSaved')+"!")
      },
      (err) => this.alert.error(err.message),
      () => this.changeSpinner("clear")
    )
  }

  swapField(fkey: string) {
    this.recordChanged = true;
    this.bibUtils.swapParallelFields(this.bib, fkey);
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
  }

  unlinkFields(fkey: string) {
    this.recordChanged = true;
    this.bibUtils.unlinkFields(this.bib, fkey); 
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
  }

  deleteField(fkey: string) {
    this.recordChanged = true;
    this.bibUtils.deleteField(this.bib, fkey); 
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
  }

  removeOption(fkey: string, sfid: string, optionValue: string) {    
    let pfkey = (fkey.substring(fkey.length-1) == "P") ? fkey.substring(0,fkey.length-1) : fkey + "P"
    let psf = this.fieldTable.get(pfkey).getSubfield(sfid)
    let sfo = this.subfield_options.get(fkey).get(sfid)
    let found = sfo.findIndex(a => a == optionValue)
    if(found > -1) {
     sfo.splice(found,1)
    }
    this.deletions.push({key: psf, value: optionValue})

    this.subfield_options.get(fkey).set(sfid,sfo)
    this.fieldTable.get(fkey).setSubfield(sfid,sfo[0])
  }

  public clearDeletions() {
    this.deletions = new Array<{key: string,value: string}>();
  }

  saveField(fkey: string) {
    let inputs : NodeListOf<HTMLInputElement> = document.querySelectorAll(".subfield_input");
    let field = this.fieldTable.get(fkey)
    let newfield = new MarcDataField(field.tag,field.ind1,field.ind2)
    let fieldUpdates = new Map<string,string>();

    for(let i = 0; i < inputs.length; i++) { 
      let id = inputs.item(i).id.replace('input-'+fkey+'-',"");      
      fieldUpdates.set(id,inputs.item(i).value)      
    }
    field.subfields.forEach(sf => {
      let newvalue = fieldUpdates.has(sf.id) ? fieldUpdates.get(sf.id) : sf.data;
      newfield.addSubfield(sf.id,sf.code,newvalue);
    })
    this.bibUtils.replaceFieldInBib(this.bib,fkey,newfield);
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
    this.recordChanged = true;

    this.deletions.sort((a,b) => 0 - (a.key > b.key ? 1 : -1))
    let prevkey = ""
    let alldels = new Array<{key: string, dels: Array<string>}>();
    let kdels = new Array<string>();
    for(let i = 0; i < this.deletions.length; i++) {
      let ki = this.deletions[i].key     
      let k_normal = this.cjkNormalize(ki)
      let keys = [ki,k_normal]
      let v = this.deletions[i].value
      if((i > 0 && prevkey != ki) || i == this.deletions.length - 1) {
        if(i == this.deletions.length - 1) {
          kdels.push(v)
        }
        for(let j = 0 ; j < keys.length; j++) {
          let jk = keys[j]          
          alldels.push({key: jk,dels: kdels})
        }        
        kdels = new Array<string>();        
      } 
      prevkey = ki
      kdels.push(v)      
    }
    let getOperations = from(alldels).pipe(concatMap(entry => this.storeService.get(entry.key)))
    let newEntries = new Array<DictEntry>();
    getOperations.subscribe({
      next: (res: DictEntry) => {
        if(res != undefined) {
          let ne = new DictEntry(res.key, res.variants, res.parallels)          
          let these_dels = alldels.find(a => {return a.key == res.key})
          for(let i = 0; i < these_dels.dels.length; i++) {
            let d = these_dels.dels[i]
            let dn = d.replace(new RegExp("(\\s|" + this.punctuationPattern + ")+$","u"),"")
            dn = dn.replace(new RegExp("^(\\s|" + this.punctuationPattern + ")+","u"),"")
            dn = dn.replace(new RegExp("\\s*\\([^\\)]+\\)[\\s\\p{P}]*$",'u'),"");
            if(!ne.deleteParallel(d)) {
              ne.deleteParallel(dn)
            }
          }
          newEntries.push(ne)
        }
      },
      complete: () => {
        let storeOperations = from(newEntries).pipe(
          concatMap(entry => this.storeService.set(entry.key,entry))
        )
        storeOperations.subscribe()

      }
    })
    this.clearDeletions();
    
  }

  findUnusedLinkage(): string {
    let seqs = new Array<boolean>(100).fill(false);
    let unused = 0;
    this.fieldTable.forEach((field_i,id) => {
      field_i.subfields.forEach(sf => {
        if(sf.code == '6') {
          let seqno : number = +sf.data.substr(4,2);
          seqs[seqno] = true;
        }
      });
    });
    for(let i = 0; i < seqs.length; i++) {
      if(i == 0 || unused > 0) {
        continue;
      }
      if(!seqs[i]) {
        unused = i;
        break;
      }
    }
    let unusedStr = "" + unused;
    if(unused < 10) {
      unusedStr = "0" + unusedStr;
    }
    return unusedStr;
  }

  async lookupInDictionary(sfdata: string): Promise<Array<string>> {
    let [startpunct,endpunct] = ["",""]
    let m = sfdata.match(new RegExp("[\\s\\p{P}]+$","u"))
    if(m) {
      endpunct = m[0];
    }
    m = sfdata.match(new RegExp("^[\\s\\p{P}]+","u"))
    if(m) {
      startpunct = m[0];
    }

    let options_final = new Array<string>();
    let options_full = new Array<string>();
    await this.storeService.get(this.cjkNormalize(sfdata)).toPromise().then((res: DictEntry) => {          
      if(res != undefined) {  
        options_full = res.parallels.map(a => a.text)      
      }
    });    

    let sfsections = sfdata.split(new RegExp("(" + this.delimiterPattern + ")","u"));
    for(let g = 0; g < sfsections.length; g++) {
      let options_d = new Array<string>();
      let text_normal_d = this.cjkNormalize(sfsections[g]);
      let search_keys_d = [sfsections[g]];
      if(text_normal_d != sfsections[g].toLowerCase()) {
        search_keys_d.push(text_normal_d)
      }
      for(let h = 0; h < search_keys_d.length; h++) {        
        let hi = search_keys_d[h];    
        if(hi.length == 0) {
          continue;
        }
        if(options_d.length > 0) {
          break;
        }
        await this.storeService.get(hi).toPromise().then((res: DictEntry) => {          
          if(res != undefined) {        
            options_d = res.parallels.map(a => a.text)      
          }
        });
      } 
      options_d = options_d.filter(a => !a.match(/^<>/))
      if(options_d.length == 0) {
        let sfparts = sfsections[g].split(new RegExp("("+ this.punctuationPattern + ")","u")); 
        for(let h = 0; h < sfparts.length; h++) {
          let search_text = sfparts[h];
          let options = new Array<string>();
          let text_normal = this.cjkNormalize(search_text);
          let search_keys = [search_text];
          if(text_normal != search_text.toLowerCase()) {
            search_keys.push(text_normal)
          }
          for(let i = 0; i < search_keys.length; i++) {
            let ki = search_keys[i].trim();
            if(ki.length == 0) {
              continue;
            }
            if(options.length > 0) {
              break;
            }
            await this.storeService.get(ki).toPromise().then((res: DictEntry) => {
              if(res != undefined) {
                options = res.parallels.map(a => a.text);
              }
            });
          }    
         options = options.filter(a => !a.trim().match(/^<>/))
        if(options.length == 0) {
            options = [search_text]
          }
          options_d = options_d.filter(a => !a.trim().match(/^<>/))
          if(options_d.length == 0) {
            options_d = options;
          } else {
            let options_temp = new Array<string>();
            options_d.forEach((opt1) => {
              options.forEach((opt2) => {
                options_temp.push(opt1 + opt2);
              });
            });
            options_d = options_temp;
          }
        }
      }    
      if(options_final.length == 0) {
        options_final = options_d;
      } else {
        let options_temp = new Array<string>();
        if(options_final.length > 1 && options_d.length > 1) {
          for(var i = 0; i < options_final.length; i++) {
            var opt1 = options_final[i]
            if(i < options_final.length-1) {
              for(var j = 0; j < options_d.length-1; j++) {
                var opt2 = options_d[j]
                options_temp.push(opt1 + opt2);
              }
            } else {
              options_temp.push(opt1+options_d[options_d.length-1])
            }
          }
        } else {
          for(var i = 0; i < options_final.length; i++) {
            var opt1 = options_final[i]
            for(var j = 0; j < options_d.length; j++) {
              var opt2 = options_d[j]
              options_temp.push(opt1 + opt2);
            }
          } 
        }
        options_final = options_temp;
      }
    }    
    
    options_final.unshift(...options_full)
    options_final = options_final.filter((a,i) => options_final.indexOf(a) === i)
    for(let i = 0; i < options_final.length; i++) {    
      m = sfdata.match(this.etal_re);
      if(m) {
        var etal = m[0]
        options_final[i] = options_final[i].replace(this.etal_re,etal);
        for(var z = endpunct.length; z > 0; z--) {
          if(etal.substring(etal.length - z) == endpunct.substring(0,z)) {
            if(z == endpunct.length) {
              endpunct = ""
            } else {
              endpunct = endpunct.substring(z)
            }
          }
        }
      }
      for(var z = endpunct.length; z > 0; z--) {
        var ep_trim = endpunct.trim().substring(0,z)
        if((ep_trim.length > 0 && 
          options_final[i].substring(options_final[i].length - ep_trim.length) == ep_trim)) {
          if(z == endpunct.length) {
            endpunct = ""
          } else {
            endpunct = endpunct.substring(z);
          }
          break
        }
      }
      for(var z = startpunct.length; z > 0; z--) {
        var sp_trim = startpunct.trim().substring(startpunct.length-z)
        if(sp_trim.length > 0 && 
          options_final[i].substring(0,z) == sp_trim) {
          if(z == startpunct.length) {
            startpunct = ""
          } else {
            startpunct = startpunct.substring(0,z)
          }
          break
        }
      }
      options_final[i] = startpunct + options_final[i] + endpunct;
    }
    options_final = options_final.filter(a=> !a.trim().match(/^<>/))
    options_final = options_final.filter((a,i) => options_final.indexOf(a) === i)
    options_final = options_final.filter(a=>!(
      this.cjkNormalize(a) == this.cjkNormalize(sfdata) && a != sfdata))
    return options_final;
}

  addParallelDictToStorage(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {          
    let storePairs: DictEntry[] = []; 
    for(let i = 0; i < this.parallelDict.length && storePairs.length <= this.dictMax; i++) {
      let entry = this.parallelDict[i]
      let pairExists = storePairs.findIndex(a => a.key == entry.key)
      if(pairExists == -1) {
        storePairs.push(entry);
      } else {
        storePairs[pairExists].mergeWith(entry)
      }
    }
    this.addToStorage(storePairs).finally(() => resolve(true))
  })
  }

  addToStorage(pairs: Array<DictEntry>): Promise<boolean> {
    return new Promise<boolean>((resolve) => {      
    let pairs2 = new Array<DictEntry>();
    for(let i = 0; i < pairs.length; i++) {
      pairs2.push(pairs[i])
    }
    let getOperations = from(pairs).pipe(concatMap(entry => this.storeService.get(entry.key)))   

    let getCount = 0
    let setCount = 0

    getOperations.subscribe({
      next: (res) => {
        if(res != undefined) { 
          let prevPair = new DictEntry(res.key,res.variants,res.parallels);
          let newPair: DictEntry = pairs.find(a => {return a.key == prevPair.key})
          let i = pairs2.findIndex(a => {return a.key == prevPair.key})
          if(!prevPair.isEqualTo(newPair)) {
            prevPair.mergeWith(newPair)  
            pairs2[i] = prevPair
          } else {
            pairs2.splice(i,1)
          }  
        } 
      },
      complete: () => {  
        let storeOperations = from(pairs2).pipe(concatMap(entry => this.storeService.set(entry.key,entry)))
        storeOperations.subscribe({
          complete: () => resolve(true)
        })
      }
    })
  })
  }

  parallelDictToString(): string {
    let resultString = "";
    if(this.parallelDict.length == 0) {
      return resultString
    }
    for(let i = 0; i < this.parallelDict.length; i++) {
      let entry = this.parallelDict[i]
      resultString += "<strong>" + entry.key + "</strong>" + "<br/>";
      resultString += "<em>"
      entry.variants.forEach(v => {
        resultString += v + ","
      })
      resultString += "</em><br/>"
      for(let j = 0; j < entry.parallels.length; j++) {
        let v = entry.parallels[j]
        resultString += v.text + ":" + v.count +  "<br/>";
      }
      resultString += "<br/>";
    }
    return resultString;
  }
  oclcNSresolver(prefix: string): string {
    let ns = {
      'srw' : 'http://www.loc.gov/zing/srw/',
      'marc' : 'http://www.loc.gov/MARC21/slim'
    }
    return ns[prefix] || null;
  }

  async getLinkedData(locURL: string) { 
    if(locURL.includes(Settings.locHost)) {
      locURL = locURL.replace("http://" + Settings.locHost + "/",Settings.awsBaseURL) + ".madsxml.xml"
      await this.http.get(locURL, {
        headers: new HttpHeaders({
          'X-Proxy-Host': Settings.locHost,
          'Authorization': 'Bearer ' + this.authToken,
          'Content-type': 'application/xml'
        }),
        responseType: 'text'
      }).toPromise().then(async (res) => {             
          let entries = this.extractLOCvariants(res)
          await this.addToStorage(entries)
      }).catch((err) => {
        this.alert.warn(this.translate.instant('Translate.TroubleConnectingTo') + 
        " " + this.translate.instant('Translate.LOCLinkedDataService') + " " +  
        this.translate.instant('Translate.TroubleConnectingToAfter') + ": " + 
        this.translate.instant('Translate.ResultsMayNotBeOptimal'))
      })   
    } 
  }

  extractLOCvariants(xml: string): Array<DictEntry> {  
    let parser = new DOMParser();
    let xmlDOM: XMLDocument = parser.parseFromString(xml, 'application/xml');
    let mainentry = xmlDOM.getElementsByTagName("mads:authority")
    let nameParts = mainentry[0].getElementsByTagName("mads:namePart")
    let entries = new Array<DictEntry>();
    for(let i = 0; i < nameParts.length; i++) {
      if(nameParts[i].getAttribute("type") == "date") {
        nameParts[i].remove()
      }
    }     
    let main_s = mainentry[0].textContent.trim()
    let variants = xmlDOM.getElementsByTagName("mads:variant")    
    for(let i = 0; i < variants.length; i++) {
      nameParts = variants[i].getElementsByTagName("mads:namePart")
      for(let j = 0; j < nameParts.length; j++) {
        if(nameParts[j].getAttribute("type") == "date") {
          nameParts[j].remove()
        }
      } 
    }
    
    let var_rom = new Array()
    let var_nonrom = new Array()

    if(main_s.match(new RegExp("[\\u0370-\\u1CFF\\u1F00-\\uFE19\\uFE30-\\uFFFF]",'u'))) {
      var_nonrom.push(main_s)
    } else {
      var_rom.push(main_s)
    }    

    for(let i = 0; i < variants.length; i++) {
      let v = variants[i].textContent.trim()
      if(v.match(new RegExp("[\\u0370-\\u1CFF\\u1F00-\\uFE19\\uFE30-\\uFFFF]",'u'))) {
        if(!var_nonrom.includes(v)) {
          var_nonrom.push(v)
        }
      } else {
        if(!var_rom.includes(v)) {
          var_rom.push(v)
        }
      }
    }    

    let vnew = new Array<string>()
    for(let i = 0; i < var_rom.length; i++) {
      for(let j = 0; j < var_nonrom.length; j++) {
        let norm = this.cjkNormalize(var_rom[i])
        let v = this.addToParallelDict(norm,var_nonrom[j],[],this.preferredLOCscore)
        vnew.push(...(v.map(a => a.key)))
      }
    }
    var_rom = vnew
    vnew = new Array<string>()
    
    for(let i = 0; i < var_nonrom.length; i++) {
      for(let j = 0; j < var_rom.length; j++) {
        let norm = this.cjkNormalize(var_nonrom[i])  
        let v = this.addToParallelDict(norm,var_rom[j],[],this.preferredLOCscore)     

        vnew.push(...(v.map(a => a.key)))
      }
    }    

    var_nonrom = vnew
    let var_all = [main_s,...var_nonrom,...var_rom]    
    for(let i = 0; i < var_all.length; i++) {
      let vi = var_all[i]
      let found = this.parallelDict.findIndex(a => a.key == vi)
      if(found > -1 && entries.find(a => a.key == vi) == undefined) {
        entries.push(this.parallelDict[found])
      }
    }   
    return entries 
  }

  extractParallelFields(xml: string, isOCLC = false): void {     
    let parser = new DOMParser();
    let xmlDOM: XMLDocument = parser.parseFromString(xml, 'application/xml');
    let records = xmlDOM.getElementsByTagName("record"); 
    for(let i = 0; i < records.length; i++) {
      let reci = records[i];               
      let isPreferredInst = false
      let datafields = reci.getElementsByTagName("datafield");
      let parallelFields = new Map<string,Array<Element>>();
      for(let j = 0; j < datafields.length; j++) {        
        let subfields = datafields[j].getElementsByTagName("subfield");        
        for(let k = 0; k < subfields.length; k++) {
          let code = subfields[k].getAttribute("code");
          if(isOCLC && this.settings.preferInstitutions && datafields[j].getAttribute("tag") == "040" &&
            (code == "a" || code == "c")) {
              let inst = subfields[k].innerHTML
              if(this.settings.preferredInstitutionList.includes(inst)) {
                isPreferredInst = true
              }
            }  
          if(code == "6") {            
            let linkage = subfields[k].innerHTML;
            linkage = linkage.substring(4,6);
            datafields[j].removeChild(subfields[k]);
            if(linkage == "00") {
              continue;
            }            
            if(!parallelFields.has(linkage)) {
              parallelFields.set(linkage, new Array<Element>());
            }
            parallelFields.get(linkage).push(datafields[j]);

          }
        }
      }
      let score = (isPreferredInst) ? this.preferredWCscore : 1
      parallelFields.forEach((value, key) => {
        if(value.length != 2) {
          return;
        }
        let subfields_a = value[0].getElementsByTagName("subfield");
        let subfields_b = value[1].getElementsByTagName("subfield");
        let sfcount = Math.min(subfields_a.length, subfields_b.length);
        if(sfcount < 1) {
          return;
        }
        for(let k = 0; k < sfcount; k++) {
          let sfka = subfields_a[k];
          let sfkb = subfields_b[k];
          if(sfka.getAttribute("code") != sfkb.getAttribute("code")) {
            break;
          }
          let text_rom = sfka.textContent;
          let text_nonrom = sfkb.textContent;          
          if(text_rom.match(this.cjk_re)) {
            text_rom = sfkb.textContent;
            text_nonrom = sfka.textContent;
          }
          if(text_rom != text_nonrom) {
            let text_rom_stripped = text_rom.replace(new RegExp("^(\\s|" + this.punctuationPattern + ")+","u"),"");
            text_rom_stripped = text_rom_stripped.replace(new RegExp("(\\s|" + this.punctuationPattern + ")+$","u"),"");

            text_nonrom = text_nonrom.replace(new RegExp("^(\\s|" + this.punctuationPattern + ")+","u"),"");
            text_nonrom = text_nonrom.replace(new RegExp("(\\s|" + this.punctuationPattern + ")+$","u"),"");

            let text_rom_normal = this.cjkNormalize(text_rom);
            let text_nonrom_normal = this.cjkNormalize(text_nonrom);

            let text_rom_parts: string[] = text_rom_stripped.split(new RegExp("(" + this.delimiterPattern + ")","u"));
            let text_nonrom_parts: string[] = text_nonrom.split(new RegExp("(" + this.delimiterPattern + ")","u"));

            if(text_rom != text_nonrom) { 
              this.addToParallelDict(text_rom_normal,text_nonrom, [], score); 
              this.addToParallelDict(text_nonrom_normal,text_rom_stripped, [], score);   
            }
            if(text_rom_parts.length == text_nonrom_parts.length) {         
              for(let m = 0; m < text_rom_parts.length; m++) {
                let rpm = text_rom_parts[m];
                let cpm = text_nonrom_parts[m];
                let rpm_normal = this.cjkNormalize(rpm);
                let cpm_normal = this.cjkNormalize(cpm); 

                if(!rpm.match(new RegExp("^" + this.delimiterPattern + "$","u")) && 
                    rpm_normal != cpm_normal) { 
                      this.addToParallelDict(rpm_normal,cpm, [], score);
                      this.addToParallelDict(cpm_normal,rpm, [], score);
                }                
              }
            }      
          }
        }           
      });
    }
  }

addToParallelDict(textA: string, textB: string, variants: string[] = [], score = 1): Array<DictEntry> {
    if(textA == textB) {
      return;
    }    
    let found = this.parallelDict.findIndex(a => a.key == textA)
    let entry: DictEntry;
    if(found == -1) {
      entry = new DictEntry(textA,[],[])
      this.parallelDict.push(entry);
    } else {
      entry = this.parallelDict[found]
    }
    entry.addVariant(textA)
    for(let i = 0; i < variants.length; i++) {
      let v = variants[i]
      entry.addVariant(v)
    }
    entry.addParallel(textB,score)
    entry.consolidate()    
    let entries_all = [entry]
    for(let i = 0; i < entry.variants.length; i++) {
      let v = entry.variants[i]  
      if(v != textA) {
        let entry2 = new DictEntry(v,entry.variants,entry.parallels)
        let found2 = this.parallelDict.findIndex(a => a.key == v)
        if(found2 == -1) {
          this.parallelDict.push(entry2)
        } else {
          this.parallelDict[found2] = entry2
        }
        entries_all.push(entry2)
      }
    }   
    return entries_all
  }

  async lookupSubfields(fkey: string) {    
      this.statusString = ""
      this.changeSpinner("saving")
      let sfo = new Map<string, Array<string>>();
      let pfkey = fkey;
      if(pfkey.substring(pfkey.length-1) == "P") {
        pfkey = pfkey.substring(0,pfkey.length - 1);
      } else {
        pfkey = pfkey + "P";
      }
      let main_field = this.fieldTable.get(fkey)
      let parallel_field = this.fieldTable.get(pfkey);
      
      let subfields = parallel_field.subfields.filter(a => a.code != '6' && a.code != '0');
            
      for(let i = 0; i < subfields.length; i++) {
        let sf = subfields[i]  
        let opts = new Array();
        let cached_options = this.fieldCache.get(pfkey)
        if(cached_options != undefined && cached_options.has(sf.id)) {
          opts = cached_options.get(sf.id)
          if(!opts.includes(sf.data)) {
            opts.push(sf.data);
          }    
          sfo.set(sf.id,opts);
          if(i == subfields.length - 1) { 
            this.subfield_options.set(fkey, sfo);  
            this.changeSpinner("clear")
            this.showDetails = fkey
          }
        } else {
          await this.lookupInDictionary(sf.data).then((res) => {
            for(let j = 0; j < res.length; j++) {   
              let str = res[j]       
              opts.push(str); 
            }
          }).finally(() => {  
            if(!opts.includes(sf.data)) {
              opts.push(sf.data);
            }    
            sfo.set(sf.id,opts);
            if(i == subfields.length - 1) { 
              this.subfield_options.set(fkey, sfo);  
              this.changeSpinner("clear")
              this.showDetails = fkey
            }            
          });
        } 
      }         
  }

  generateBGColor(linkage: string) {
    let seqno = Number.parseInt(linkage.substring(4,6));
    if(seqno > 0) {
      let hue = 60;
      for(let i  = 1; i < seqno; i++) {
        hue = ((hue + 75) % 360);
      }
      return "hsl(" + hue + ",85%,90%)"
    } else {
      return "#FFFFFF"
    }
  }
  cjkNormalize(inputString: string): string {
    let outputString = inputString;
    outputString = outputString.toLowerCase();
    outputString = outputString.normalize("NFD");
    outputString = outputString.replace(this.etal_re,"");
    if (outputString.match(this.cjk_re)) {
      outputString = outputString.replace(new RegExp("[\\p{P}\\p{Mn}\\s]+$",'gu'), "");
      outputString = outputString.replace(new RegExp("^[\\p{P}\\p{Mn}\\s]+",'gu'), "");
    } else {
      outputString = outputString.replace(new RegExp("[\\p{P}\\p{Mn}\\p{Lm}\\s]",'gu'), "");
    }
    return outputString;
  }
  update(value: any) {
    this.statusString = ""
    this.changeSpinner("saving")
    let requestBody = this.tryParseJson(value);
    if (!requestBody) {
      this.changeSpinner("clear")
      return this.alert.error('Failed to parse json');
    }
    this.sendUpdateRequest(requestBody);
  }

  refreshPage = () => {
    this.statusString = ""
    this.changeSpinner("saving")
    this.eventsService.refreshPage().subscribe({
      next: () => this.alert.success('Success!'),
      error: e => {
        console.error(e);
        this.alert.error('Failed to refresh page');
      },
      complete: () => this.changeSpinner("clear")
    });
  }

  private sendUpdateRequest(requestBody: any) {
    let request: Request = {
      url: this.pageEntities[0].link,
      method: HttpMethod.PUT,
      requestBody
    };
    this.restService.call(request).subscribe({
      next: result => {
        this.refreshPage();
      },
      error: (e: RestErrorResponse) => {
        this.alert.error('Failed to update data');
        console.error(e);
        this.changeSpinner("clear")
      }
    });
  }

  private tryParseJson(value: any) {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error(e);
    }
    return undefined;
  }

}

