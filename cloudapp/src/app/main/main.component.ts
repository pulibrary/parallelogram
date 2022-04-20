import { concat, identity, Observable, of, Subscription, VirtualTimeScheduler } from 'rxjs';
import { 
  Component, OnInit, OnDestroy, ɵɵCopyDefinitionFeature, resolveForwardRef, 
  ViewChild, ElementRef, HostListener, Injectable } from '@angular/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod, CloudAppSettingsService,
  Entity, EntityType, PageInfo, RestErrorResponse, AlertService, CloudAppConfigService, 
  CloudAppStoreService,
  InitData,
} from '@exlibris/exl-cloudapp-angular-lib';
import {WadegilesService} from "../wadegiles.service"
import { Bib, BibUtils } from './bib-utils';
import {DictEntry} from './dict-entry'
import { from } from 'rxjs';
import { elementAt, finalize, switchMap, concatMap, timeout, timestamp, concatAll, map } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Settings } from '../models/settings';
import {OclcQuery} from './oclc-query';
import {MarcDataField} from './marc-datafield';
import { Router, ActivatedRoute, ParamMap, ResolveEnd } from '@angular/router';
import { PinyinService } from '../pinyin.service';
import { LangChangeEvent, TranslateService } from '@ngx-translate/core';
import { marker as _ } from '@biesbjerg/ngx-translate-extract-marker';
import {AppService} from '../app.service'

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

  hasApiResult: boolean = false;
  loading = false;
  saving = false;
  recordChanged = false;
  completedSearches = 0;
  totalSearches = 0;
  private bibUtils: BibUtils;
  private settings: Settings;
  bib: Bib;
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

  deletions: Array<{key: string,value: string}>;
  
  preSearchArray: Array<string>
  preSearchFields: Map<string,boolean>;
  fieldCache: Map<string,Map<string,Array<string>>>
  linkedDataCache: Array<string>

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
    private wadegiles: WadegilesService,
    private pinyin:PinyinService,
    private router: Router) { }

  //@HostListener('blur',['$event'])
  canDeactivate(): Observable<boolean> | boolean {
    if(this.recordChanged) {
      return confirm('Unsaved changes will be lost.  Are you sure you want to leave this page?');
    }    
    return true;
  }	

  ngOnInit() {
    this.settingsService.get().subscribe(stgs => {
      this.settings = stgs as Settings;
      if(this.settings.pinyinonly) {
        this.doSearch = false;
      } else if(!this.settings.wckey) {   
        this.router.navigate(['settings'],{relativeTo: this.route})
      } 
      this.preSearchArray = this.settings.preSearchList
      if(this.settings.interfaceLang == "") {
        this.eventsService.getInitData().subscribe(data=> {
          this.initData = data
          this.settings.interfaceLang = this.initData.lang      
        });
      }  
      this.translate.use(this.settings.interfaceLang)   
    });
     
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    this.parallelDict = new Array<DictEntry>();    
    this.subfield_options = new Map<string, Map<string, Array<string>>>();
    this.deletions = new Array<{key: string,value: string}>();
    this.preSearchFields = new Map<string,boolean>()   
    this.authToken_ready = this.eventsService.getAuthToken().toPromise()
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

  onPageLoad = (pageInfo: PageInfo) => {
    if(this.route.snapshot.queryParamMap.has('doSearch') && this.doSearch) {
      this.doSearch = (this.route.snapshot.queryParamMap.get('doSearch') == "true")
    }
    this.wadegiles.ready.then((wg_ready) =>  {

    this.pinyin.ready.then((py_ready) => {
    this.authToken_ready.then((aut) => {
    this.authToken = aut
    this.bibUtils = new BibUtils(this.restService,this.alert);
    this.fieldCache = new Map<string,Map<string,Array<string>>>()   
    this.linkedDataCache = new Array<string>()

    this.pageEntities = (pageInfo.entities||[]).filter(e=>[EntityType.BIB_MMS, 'IEP', 'BIB'].includes(e.type));
    if ((pageInfo.entities || []).length == 1) {
      const entity = pageInfo.entities[0];
      this.bibUtils.getBib(entity.id).subscribe(bib=> {
        this.bib = null;
        if(bib.record_format=='marc21') {
          this.bib = bib;
          this.languageCode = this.bibUtils.getLanguageCode(bib)
          this.extractParallelFields(this.bib.anies);
          this.fieldTable = this.bibUtils.getDatafields(bib);
          if(this.doSearch && this.settings.wckey != undefined) {            
            this.loading = true;
            let oclcQueries: Array<OclcQuery> = [];
            this.bib.lccns = this.bibUtils.getBibField(bib,"010","a").trim();
            if(this.bib.lccns != "") {oclcQueries.push(new OclcQuery("dn", "exact",this.bib.lccns))}
            this.bib.isbns = this.bibUtils.getBibField(bib,"020","a").trim();
            if(this.bib.isbns != "") {
              oclcQueries.push(new OclcQuery("bn","any",this.bib.isbns.replace("-","")))
            }
            this.bib.issns = this.bibUtils.getBibField(bib,"022","a").trim();
            if(this.bib.issns != "") {
              oclcQueries.push(new OclcQuery("in","any",this.bib.issns.replace("-","")))
            }
            this.bib.oclcnos = this.bibUtils.extractOCLCnums(this.bibUtils.getBibField(bib,"035","a")).trim();
            if(this.bib.oclcnos != "") {oclcQueries.push(new OclcQuery("no","any",this.bib.oclcnos))}
            this.bib.title = this.bibUtils.getBibField(bib,"245","a").trim();
            let [t1,t2] = this.bib.title.split(/\s*=\s*/,2);
            if(!t2) {
              [t1,t2] = this.bib.title.split(/\s*\(/,2);
              if(t2) {
                t2 = t2.replace(/[\p{P}\s]*$/u,"");
              }
            }
            let titles = [this.bib.title];
            let title_wg = this.wadegiles.WGtoPY(this.bib.title);
            if(this.settings.searchWG && title_wg.toLowerCase() != this.bib.title.toLowerCase()) {
                titles.push(title_wg);
            }
                        
            if(t2) {
              let t1wg = this.wadegiles.WGtoPY(t1);
              let t2wg = this.wadegiles.WGtoPY(t2);
              titles.push(t1,t2);
              if(this.settings.searchWG) {
                if(t1.toLowerCase() != t1wg.toLowerCase()) {
                  titles.push(t1wg);
                }
                if(t2.toLowerCase() != t2wg.toLowerCase()) {
                  titles.push(t2wg);
                }
              }
            }            
            this.bib.names = this.bibUtils.getBibField(bib,"100","a".trim()) + "|" + 
              this.bibUtils.getBibField(bib,"700","a").trim();
            this.bib.names = this.bib.names.replace(new RegExp("^\\\|"),"")
              .replace(new RegExp("\\\|$"),"");

            let names = this.bib.names.split("\\\|");

            titles.forEach(title => {              
              names.forEach( name => {
                if(name == "") {
                  return;
                }
                let tnq = new OclcQuery("ti","exact",title);
                tnq.addParams("au","=",name);
                oclcQueries.push(tnq);
                if(this.settings.searchWG) {
                  let name_wg = this.wadegiles.WGtoPY(name);
                  if(name_wg.toLowerCase() != name.toLowerCase()) {
                    let tnq_wg = new OclcQuery("ti","exact",title);
                    tnq_wg.addParams("au","=",name_wg);
                    oclcQueries.push(tnq_wg);
                  }
                }                
              });
              oclcQueries.push(new OclcQuery("ti","exact",title));
            });
            if(oclcQueries.length > 0) {
              this.completedSearches = 0;  
              this.totalSearches = oclcQueries.length;
              if(this.totalSearches > 0) {
                this.loading = true;
               this.statusString = this.translate.instant('Translate.Searching') + " WorldCat: 0%";
              }     
              oclcQueries.map(oq => this.getOCLCrecords(oq))      
            }
         } 
        }
      })
    } else {
      this.apiResult = {};
    }
  });
  });
  });
  }

  getOCLCrecords(oq: OclcQuery) {
    let wcKey = this.settings.wckey;
    let wcURL = Settings.wcBaseURL + "?" + Settings.wcQueryParamName + "=" +
      oq.getQueryString() + Settings.wcOtherParams;
    this.http.get(wcURL, {
          headers: new HttpHeaders({
            'X-Proxy-Host': 'worldcat.org',
            'wskey': wcKey.toString(),
            'Authorization': 'Bearer ' + this.authToken,
            'Content-type': 'application/xml'
          }),
          responseType: 'text'
        }).subscribe(
      (res) => {
        this.extractParallelFields(res);
      },
      (err) => {this.alert.error(err.message)},
      () => {
        this.completedSearches++;
        this.searchProgress = Math.floor(this.completedSearches*100/this.totalSearches);
        this.statusString = this.translate.instant('Translate.Searching') + " WorldCat: " + this.searchProgress  + "%";
        if(this.completedSearches == this.totalSearches) {
          this.statusString = this.translate.instant('Translate.AnalyzingRecords') + "... "
          this.addParallelDictToStorage().finally(async () => {  
            if(this.settings.doPresearch) {          
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
                    for(let k = 0; this.fieldTable.has(fj+":"+k); k++) {  
                      this.statusString = this.translate.instant('Translate.Presearching') + ": " + 
                        this.translate.instant('Translate.Field') + " "  + fj                  
                      await this.lookupField(fj+":"+k,true)
                    }
                  }
                } else {              
                  for(let k = 0; this.fieldTable.has(f+":"+k); k++) {
                    this.statusString = this.translate.instant('Translate.Presearching') + ": " + 
                      this.translate.instant('Translate.Field') + " " + f
                    await this.lookupField(f+":"+k,true)
                  }
                }                
              }              
            }
            this.loading = false
          })
        }
      }
    )
  }

  async lookupField(fkey: string, presearch = false) {
    this.showDetails = ""
    let field = this.fieldTable.get(fkey)
    let parallel_field = new MarcDataField("880",field.ind1,field.ind2);
    let seqno = this.findUnusedLinkage();
    let seq = field.tag + "-" + seqno;
    let seq880 = "880-" + seqno;    
    parallel_field.addSubfield("61","6",seq);
    this.saving = true;

    let pfkey = fkey;
    if(pfkey.substring(pfkey.length-1) == "P") {
      pfkey = pfkey.substring(0,pfkey.length - 1);
    } else {
      pfkey = pfkey + "P";
    }

    let options_map = new Map<string, Array<string>>()
    let cached_options = this.fieldCache.get(fkey)


    if(this.settings.pinyinonly) {
      for(let j = 0; j < field.subfields.length; j++) {
        let sf = field.subfields[j];
        let pylookup = this.pinyin.lookup(sf.data,field.tag,field.ind1,sf.code)
        if(presearch && pylookup != sf.data) {
          this.preSearchFields.set(fkey,true)
          break
        }
        parallel_field.addSubfield(sf.id,sf.code,pylookup)
      }
    } else {
      let linkedDataURL = field.subfields.find(a => a.code == "0")
      if(linkedDataURL != undefined && !this.linkedDataCache.includes(linkedDataURL.data)) {
        await this.getLinkedData(linkedDataURL.data)
        this.linkedDataCache.push(linkedDataURL.data)

      }
      for(let j = 0; j < field.subfields.length; j++) {
        let sf = field.subfields[j];
        if(sf.code == "0") {
          parallel_field.addSubfield(sf.id,sf.code,sf.data)
          continue
        }        
        let options = new Array<string>()
        if(cached_options != undefined && cached_options.has(sf.id)) {
          options = cached_options.get(sf.id)
        } else {
          options = await this.lookupInDictionary(sf.data);  
        }        
        if(presearch && options[0] != sf.data) {
          this.preSearchFields.set(fkey,true)
        }   
        let best = 0  
        let bookends = ""
        if(sf.data.match(/^\p{P}/u)) {
          bookends += sf.data.charAt(0)
        }
        if(sf.data.match(/\p{P}$/u)) {
          bookends += sf.data.charAt(sf.data.length-1)
        }
        for(let k = 0; k < options.length; k++) {
          let opt_k = options[k]
          let bookends_k = ""
          if(opt_k.match(/^\p{P}/u)) {
            bookends_k += opt_k.charAt(0)
          }
          if(opt_k.match(/\p{P}$/u)) {
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
    }
    this.saving = false;
    if(!presearch) {
      field.addSubfield("61","6",seq880,true);

      this.bibUtils.replaceFieldInBib(this.bib,fkey,field);
      this.bibUtils.addFieldToBib(this.bib,parallel_field);  
      if(this.settings.doSwap) {
        this.doParallelSwap(fkey,field.getSubfieldString(),parallel_field.getSubfieldString())
      }
 
      this.fieldTable = this.bibUtils.getDatafields(this.bib)
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
    this.saving = true;
    this.extractParallelFields(this.bib.anies)
    this.addParallelDictToStorage()
    this.extractParallelFields(this.bib.anies)
    this.bibUtils.updateBib(this.bib).subscribe(() => {
      this.saving = false;
      this.recordChanged = false;
    }) 
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
    let inputs : NodeListOf<HTMLInputElement> = document.querySelectorAll(".subfieldInput");
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
      if(this.settings.searchWG) {
        let k_wg = this.cjkNormalize(this.wadegiles.WGtoPY(ki))
        keys.push(k_wg)
      }
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
            dn = dn.replace(/\s*\([^\)]+\)[\s\p{P}]*$/u,"");
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
    //this.alert.warn(sfdata)
    let [startpunct,endpunct] = ["",""]
    let m = sfdata.match(new RegExp("(\\s|" + this.punctuationPattern + ")+$","u"))
    if(m) {
      endpunct = m[0];
    }
    m = sfdata.match(new RegExp("^(\\s|" + this.punctuationPattern + ")+","u"))
    if(m) {
      startpunct = m[0];
    }
    /* I MAY WANT TO RE-ADD THIS SUFFIX CODE.  It was just messing up some things with the authority entries
    let suffix = "";
    m = sfdata.match(/\s*\([^\)]+\)[\s\p{P}]*$/u);
    if(m) {
      suffix = m[0];
      sfdata = sfdata.substring(0,sfdata.length - suffix.length);
    }
    */

    let options_final = new Array<string>();
    let sfsections = sfdata.split(new RegExp("(" + this.delimiterPattern + ")","u"));
    /* THIS TOO
    if(suffix != "") {
      sfsections.push(suffix);
    }*/
    for(let g = 0; g < sfsections.length; g++) {
      let options_d = new Array<string>();
      let text_normal_d = this.cjkNormalize(sfsections[g]);
      let search_keys_d = [sfsections[g]];
      if(text_normal_d != sfsections[g]) {
        search_keys_d.push(text_normal_d)
      }
      if(this.settings.searchWG) {
        let text_normal_wgpy_d = this.cjkNormalize(this.wadegiles.WGtoPY(sfsections[g]));
        if(text_normal_wgpy_d != text_normal_d) {
          search_keys_d.push(text_normal_wgpy_d);
        }
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
          let search_keys = [search_text,text_normal];
          if(this.settings.searchWG) {
            let text_normal_wgpy = this.cjkNormalize(this.wadegiles.WGtoPY(search_text));    
            search_keys.push(text_normal_wgpy);
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
            options = [search_text];
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
        options_final.forEach((opt1) => {
          options_d.forEach((opt2) => {
            options_temp.push(opt1 + opt2);
          });
        });
        options_final = options_temp;
      }
    }
    for(let i = 0; i < options_final.length; i++) {      
      m = sfdata.match(this.etal_re);
      if(m) {
        options_final[i] = options_final[i].replace(this.etal_re,m[0]);
      }
      if(options_final[i].substr(options_final[i].length - endpunct.length) == endpunct) {
        endpunct = "";
      }
      if(options_final[i].substr(0,startpunct.length) == startpunct) {
        startpunct = "";
      }
      options_final[i] = startpunct + options_final[i] + endpunct;
    }
    
    options_final = options_final.filter(a=> !a.trim().match(/^<>/))
    return options_final;
}

  addParallelDictToStorage(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
    let storePairs: DictEntry[] = [];    
    for(let i = 0; i < this.parallelDict.length && storePairs.length <= 200; i++) {
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
        let v = entry.parallels[i]
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
    if(locURL.match("id\.loc\.gov")) {
      locURL = locURL.replace("http://id.loc.gov/",Settings.awsBaseURL) + ".madsxml.xml"
      await this.http.get(locURL, {
        headers: new HttpHeaders({
          'X-Proxy-Host': 'id.loc.gov',
          'Authorization': 'Bearer ' + this.authToken,
          'Content-type': 'application/xml'
        }),
        responseType: 'text'
      }).toPromise().then(async (res) => {             
          let entries = this.extractLOCvariants(res)
          await this.addToStorage(entries)
      }).catch((err) => {
        this.alert.error(err.error,{autoClose: false})
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

    if(main_s.match(/[\u0370-\u1CFF\u1F00-\uFFFF]/u)) {
      var_nonrom.push(main_s)
    } else {
      var_rom.push(main_s)
    }    

    for(let i = 0; i < variants.length; i++) {
      let v = variants[i].textContent.trim()
      if(v.match(/[\u0370-\u1CFF\u1F00-\uFFFF]/u)) {
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
        let v = this.addToParallelDict(var_rom[i],var_nonrom[j],[norm])
        vnew.push(...(v.map(a => a.key)))
      }
    }
    var_rom = vnew
    vnew = new Array<string>()
    
    for(let i = 0; i < var_nonrom.length; i++) {
      for(let j = 0; j < var_rom.length; j++) {
        let norm = this.cjkNormalize(var_nonrom[i])       
        let v = this.addToParallelDict(var_nonrom[i],var_rom[j],[norm])
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

  extractParallelFields(xml: string): void {    
    let parser = new DOMParser();
    let xmlDOM: XMLDocument = parser.parseFromString(xml, 'application/xml');
    let records = xmlDOM.getElementsByTagName("record");
    for(let i = 0; i < records.length; i++) {
      let reci = records[i];
      let datafields = reci.getElementsByTagName("datafield");
      let parallelFields = new Map<string,Array<Element>>();
      for(let j = 0; j < datafields.length; j++) {
        let subfields = datafields[j].getElementsByTagName("subfield");
        for(let k = 0; k < subfields.length; k++) {
          let code = subfields[k].getAttribute("code");  
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
            let text_rom_wgpy = this.wadegiles.WGtoPY(text_rom);

            text_nonrom = text_nonrom.replace(new RegExp("^(\\s|" + this.punctuationPattern + ")+","u"),"");
            text_nonrom = text_nonrom.replace(new RegExp("(\\s|" + this.punctuationPattern + ")+$","u"),"");

            let text_rom_normal = this.cjkNormalize(text_rom);
            let text_rom_wgpy_normal = this.cjkNormalize(text_rom_wgpy);
            let text_nonrom_normal = this.cjkNormalize(text_nonrom);

            let text_rom_parts: string[] = text_rom_stripped.split(new RegExp("(" + this.delimiterPattern + ")","u"));
            let text_nonrom_parts: string[] = text_nonrom.split(new RegExp("(" + this.delimiterPattern + ")","u"));

            if(text_rom_parts.length != text_nonrom_parts.length) {
              if(text_rom != text_nonrom) { 
                if(this.settings.searchWG) {
                  this.addToParallelDict(text_rom_normal,text_nonrom,[text_rom_wgpy_normal]);   
                } else {
                  this.addToParallelDict(text_rom_normal,text_nonrom); 
                }
                this.addToParallelDict(text_nonrom_normal,text_rom_stripped);   
              }
            } else {            
              for(let m = 0; m < text_rom_parts.length; m++) {
                let rpm = text_rom_parts[m];
                let rpm_wgpy = this.wadegiles.WGtoPY(rpm);
                let cpm = text_nonrom_parts[m];
                let rpm_normal = this.cjkNormalize(rpm);
                let rpm_wgpy_normal = this.cjkNormalize(rpm_wgpy);
                let cpm_normal = this.cjkNormalize(cpm); 

                if(!rpm.match(new RegExp("^" + this.delimiterPattern + "$","u")) && 
                    rpm_normal != cpm_normal) { 
                      if(this.settings.searchWG) {
                        this.addToParallelDict(rpm_normal,cpm,[rpm_wgpy_normal]);
                      } else {
                        this.addToParallelDict(rpm_normal,cpm);
                      }
                      this.addToParallelDict(cpm_normal,rpm);
                }                
              }
            }      
          }
        }           
      });
    }
  }

addToParallelDict(textA: string, textB: string, variants: string[] = []): Array<DictEntry> {
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
    entry.addParallel(textB,1)
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
      this.saving = true
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
        if(!this.settings.pinyinonly) {
          let cached_options = this.fieldCache.get(pfkey)
          if(cached_options != undefined && cached_options.has(sf.id)) {
            opts = cached_options.get(sf.id)
            if(!opts.includes(sf.data)) {
              opts.push(sf.data);
            }    
            sfo.set(sf.id,opts);
            if(i == subfields.length - 1) { 
              this.subfield_options.set(fkey, sfo);  
              this.saving = false
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
                this.saving = false
                this.showDetails = fkey
              }            
            });
          }
        } else {
          let pylookup = this.pinyin.lookup(sf.data,parallel_field.tag,parallel_field.ind1,sf.code);
          if(pylookup != sf.data && !opts.includes(pylookup)) {
            opts.push(pylookup);
          }
          if(!opts.includes(sf.data)) {
            opts.push(sf.data);
          }
          sfo.set(sf.id,opts);
          this.subfield_options.set(fkey, sfo);  
          this.saving = false        
          this.showDetails = fkey
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
      outputString = outputString.replace(/[\p{P}\p{Mn}\s]+$/gu, "");
      outputString = outputString.replace(/^[\p{P}\p{Mn}\s]+/gu, "");
    } else {
      outputString = outputString.replace(/[\p{P}\p{Mn}\p{Lm}\s]/gu, "");
    }
    return outputString;
  }
  update(value: any) {
    this.loading = true;
    let requestBody = this.tryParseJson(value);
    if (!requestBody) {
      this.loading = false;
      return this.alert.error('Failed to parse json');
    }
    this.sendUpdateRequest(requestBody);
  }

  refreshPage = () => {
    this.loading = true;
    this.eventsService.refreshPage().subscribe({
      next: () => this.alert.success('Success!'),
      error: e => {
        console.error(e);
        this.alert.error('Failed to refresh page');
      },
      complete: () => this.loading = false
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
        this.loading = false;
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
