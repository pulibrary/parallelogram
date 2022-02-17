import { concat, identity, Observable, of, Subscription } from 'rxjs';
import { Component, OnInit, OnDestroy, ɵɵCopyDefinitionFeature, resolveForwardRef, ViewChild, ElementRef } from '@angular/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod, CloudAppSettingsService,
  Entity, EntityType, PageInfo, RestErrorResponse, AlertService, CloudAppConfigService, 
  CloudAppStoreService,
} from '@exlibris/exl-cloudapp-angular-lib';
import {WadegilesService} from "../wadegiles.service"
import { Bib, BibUtils } from './bib-utils';
import {DictEntry} from './dict-entry'
import { from } from 'rxjs';
import { elementAt, finalize, switchMap, concatMap, timeout, timestamp, concatAll, map } from 'rxjs/operators';
import { HttpClient, HttpHeaders, JsonpClientBackend } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { Settings } from '../models/settings';
import {OclcQuery} from './oclc-query';
import {MarcDataField} from './marc-datafield';
import { SettingsComponent } from '../settings/settings.component';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { RelatorTermsService } from '../relator_terms.service';
import { PinyinService } from '../pinyin.service';
import { MissingTranslationHandler } from '@ngx-translate/core';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})


export class MainComponent implements OnInit, OnDestroy {
  private pageLoad$: Subscription;
  pageEntities: Entity[];
  private _apiResult: any;

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
  parallelDict: Map<string, DictEntry>;
  subfield_options: Map<string, Map<string, Array<string>>>;
  statusString: string = "";
  doSearch: boolean = true;
  searchProgress: number = 0;
  lookupComplete: Promise<boolean>;
  showDetails = ""
  deleteMarker = "**DELETE**"

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
    private configService: CloudAppConfigService,
    private alert: AlertService,
    private storeService: CloudAppStoreService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private wadegiles: WadegilesService,
    private pinyin:PinyinService,
    private relator_terms: RelatorTermsService,
    private router: Router) { }

  ngOnInit() {
    this.settingsService.get().subscribe(stgs => {
      this.settings = stgs as Settings;
      if(this.settings.pinyinonly) {
        this.doSearch = false;
      } else if(!this.settings.wckey) {   
        this.router.navigate(['settings'],{relativeTo: this.route})
      } 
    });
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    this.parallelDict = new Map();    
    this.subfield_options = new Map<string, Map<string, Array<string>>>();
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
    this.relator_terms.ready.then((rt_ready) => {
    this.wadegiles.ready.then((wg_ready) =>  {
    this.pinyin.ready.then((py_ready) => {
    this.bibUtils = new BibUtils(this.restService,this.alert);
    this.pageEntities = (pageInfo.entities||[]).filter(e=>[EntityType.BIB_MMS, 'IEP', 'BIB'].includes(e.type));
    if ((pageInfo.entities || []).length == 1) {
      const entity = pageInfo.entities[0];
      this.bibUtils.getBib(entity.id).subscribe(bib=> {
        this.bib = null;
        if(bib.record_format=='marc21') {
          this.bib = bib;
          this.languageCode = this.bibUtils.getLanguageCode(bib)
          this.extractParallelFields(this.bib.anies);
          //this.addParallelDictToStorage();
          this.fieldTable = this.bibUtils.getDatafields(bib);
          if(this.doSearch && this.settings.wckey != undefined) {
            this.loading = true;
            let oclcQueries: Array<OclcQuery> = [];
            this.bib.lccns = this.bibUtils.getBibField(bib,"010","a");
            if(this.bib.lccns != "") {oclcQueries.push(new OclcQuery("dn", "exact",this.bib.lccns))}
            this.bib.isbns = this.bibUtils.getBibField(bib,"020","a");
            if(this.bib.isbns != "") {
              oclcQueries.push(new OclcQuery("bn","any",this.bib.isbns.replace("-","")))
            }
            this.bib.issns = this.bibUtils.getBibField(bib,"022","a");
            if(this.bib.issns != "") {
              oclcQueries.push(new OclcQuery("in","any",this.bib.issns.replace("-","")))
            }
            this.bib.oclcnos = this.bibUtils.extractOCLCnums(this.bibUtils.getBibField(bib,"035","a"));
            if(this.bib.oclcnos != "") {oclcQueries.push(new OclcQuery("no","any",this.bib.oclcnos))}
          
            this.bib.title = this.bibUtils.getBibField(bib,"245","a");
            let [t1,t2] = this.bib.title.split(/\s*=\s*/,2);
            if(!t2) {
              [t1,t2] = this.bib.title.split(/\s*\(/,2);
              if(t2) {
                t2 = t2.replace(/[\p{P}\s]*$/u,"");
              }
            }
            let titles = [this.bib.title];
            let title_wg = this.wadegiles.WGtoPY(this.bib.title);
            if(title_wg.toLowerCase() != this.bib.title.toLowerCase()) {
                titles.push(title_wg);
            }
            
            if(t2) {
              let t1wg = this.wadegiles.WGtoPY(t1);
              let t2wg = this.wadegiles.WGtoPY(t2);
              titles.push(t1,t2);
              if(t1.toLowerCase() != t1wg.toLowerCase()) {
                titles.push(t1wg);
              }
              if(t2.toLowerCase() != t2wg.toLowerCase()) {
                titles.push(t2wg);
              }
            }
            
            this.bib.names = this.bibUtils.getBibField(bib,"100","a") + "|" + 
              this.bibUtils.getBibField(bib,"700","a");
            this.bib.names = this.bib.names.replace(new RegExp("^\\\|"),"")
              .replace(new RegExp("\\\|$"),"");

            let names = this.bib.names.split("\\\|");
            titles.forEach(title => {
              oclcQueries.push(new OclcQuery("ti","exact",title));
              names.forEach( name => {
                if(name == "") {
                  return;
                }
                let tnq = new OclcQuery("ti","exact",title);
                tnq.addParams("au","=",name);
                oclcQueries.push(tnq);
                let name_wg = this.wadegiles.WGtoPY(name);
                if(name_wg.toLowerCase() != name.toLowerCase()) {
                  let tnq_wg = new OclcQuery("ti","exact",title);
                  tnq_wg.addParams("au","=",name_wg);
                  oclcQueries.push(tnq_wg);
                }
              });
            });

            this.completedSearches = 0;  
            this.totalSearches = oclcQueries.length;
            if(this.totalSearches > 0) {
              this.loading = true;
              this.statusString = "Searching WorldCat: 0% complete";
            }    
            
            oclcQueries.map(oq => this.getOCLCrecords(oq))      
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
    //this.alert.info(oq.getQueryString(),{autoClose: false})
    let wcKey = this.settings.wckey;
    let wcURL = Settings.wcBaseURL + "?" + Settings.wcQueryParamName + "=" +
      oq.getQueryString() + Settings.wcOtherParams;
    //this.alert.info(wcURL,{autoClose: false});
    this.eventsService.getAuthToken().pipe(
      switchMap(token => 
        this.http.get(wcURL, {
          headers: new HttpHeaders({
            'X-Proxy-Host': 'worldcat.org',
            'wskey': wcKey.toString(),
            'Authorization': 'Bearer ' + token,
            'Content-type': 'application/xml'
          }),
          responseType: 'text'
        })
      )
    ).subscribe(
      (res) => {
        //this.alert.success(res,{autoClose: false})
        this.extractParallelFields(res);
      },
      (err) => {this.alert.error(err.message)},
      () => {
        this.completedSearches++;
        this.searchProgress = Math.floor(this.completedSearches*100/this.totalSearches);
        this.statusString = "Searching WorldCat: " + this.searchProgress  + "% complete";
        if(this.completedSearches == this.totalSearches) {
          this.addParallelDictToStorage();      
          this.alert.info(this.parallelDictToString(),{autoClose: false})   
        }
      }
    )
  }

  async lookupField(fkey) {
    let field = this.fieldTable.get(fkey)
    let parallel_field = new MarcDataField("880",field.ind1,field.ind2);
    let seqno = this.findUnusedLinkage();
    let seq = field.tag + "-" + seqno;
    let seq880 = "880-" + seqno;    
    parallel_field.addSubfield("61","6",seq);
    for(let j = 0; j < field.subfields.length; j++) {
      let sf = field.subfields[j];
      this.saving = true;
      if(this.settings.pinyinonly) {
        let pylookup = this.pinyin.lookup(sf.data,field.tag,field.ind1,sf.code)
        parallel_field.addSubfield(sf.id,sf.code,pylookup)
      } else {
        let options = await this.lookupInDictionary(sf.data);        
        parallel_field.addSubfield(sf.id,sf.code,options[0])
        
      }
      this.saving = false;
    }    
    field.addSubfield("61","6",seq880,true);

    this.bibUtils.replaceFieldInBib(this.bib,fkey,field);
    this.bibUtils.addFieldToBib(this.bib,parallel_field);   
 
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
    this.recordChanged = true;
  }

  saveRecord() {
    this.saving = true;
    //this.alert.warn(this.bib.anies,{autoClose: false})
    this.extractParallelFields(this.bib.anies)
    //this.alert.warn(this.parallelDictToString(),{autoClose: false})
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

  deleteField(fkey: string) {
    this.recordChanged = true;
    this.bibUtils.deleteField(this.bib, fkey); 
    this.fieldTable = this.bibUtils.getDatafields(this.bib)
  }

  removeOption(fkey: string, sfid: string, optionValue: string) {
    //let pfkey = (fkey.substring(fkey.length-1) == "P") ? fkey.substring(0,fkey.length-1) : fkey + "P"
    //let psf = this.fieldTable.get(pfkey).getSubfield(sfid)
    //if(psf && psf != "") {
      //let optionList = this.lookupInDictionary(psf,optionValue);
    let sfo = this.subfield_options.get(fkey).get(sfid)
    let found = sfo.findIndex(a => a == optionValue)
    if(found > -1) {
     sfo[found] = this.deleteMarker + sfo[found]
    }
    let newindex = 0;
    for(let i = 0; i < sfo.length; i++) {
      if(!sfo[i].includes(this.deleteMarker)) {
        newindex = i
        break
      }
    }

    this.subfield_options.get(fkey).set(sfid,sfo)
    this.fieldTable.get(fkey).setSubfield(sfid,sfo[newindex])
      //})
    //}    
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

  async lookupInDictionary(sfdata: string, deleteEntry = ""): Promise<Array<string>> {
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
    let suffix = "";
    m = sfdata.match(/\s*\([^\)]+\)[\s\p{P}]*$/u);
    if(m) {
      suffix = m[0];
      sfdata = sfdata.substring(0,sfdata.length - suffix.length);
    }
    if(deleteEntry != "") {
      if(deleteEntry.substring(0,startpunct.length) == startpunct) {
        deleteEntry = deleteEntry.substring(startpunct.length)
      } 
     if(deleteEntry.substring(deleteEntry.length - endpunct.length) == endpunct) {
        deleteEntry = deleteEntry.substring(0,deleteEntry.length - endpunct.length)
      } 
      if(deleteEntry.substring(deleteEntry.length - suffix.length) == suffix) {
        deleteEntry = deleteEntry.substring(0,deleteEntry.length - suffix.length)
      } 
    }

    let options_final = new Array<string>();
    //let sfparts = sfdata.split(new RegExp("(" + this.punctuationPattern + ")"))
    let sfsections = sfdata.split(new RegExp("(" + this.delimiterPattern + ")","u"));
    if(suffix != "") {
      sfsections.push(suffix);
    }
    for(let g = 0; g < sfsections.length; g++) {
      let options_d = new Array<string>();
      let text_normal_d = this.cjkNormalize(sfsections[g]);
      let text_normal_wgpy_d = this.cjkNormalize(this.wadegiles.WGtoPY(sfsections[g]));
      let search_keys_d = [sfsections[g],text_normal_d,text_normal_wgpy_d];
      //this.alert.info(JSON.stringify(search_keys_d),{autoClose: false});
      for(let h = 0; h < search_keys_d.length; h++) {
        let hi = search_keys_d[h];        
        if(hi.length == 0) {
          continue;
        }
        if(options_d.length > 0) {
          break;
        }
        //this.alert.info(hi,{autoClose: false});
        await this.storeService.get(hi).toPromise().then((res: DictEntry) => {
          //this.alert.success("*" + JSON.stringify(res),{autoClose: false})
          if(res != undefined) {  
            //this.alert.success(JSON.stringify(res),{autoClose: false})          
            options_d = res.parallels.map(a => a.text)  
            //this.alert.info(JSON.stringify(options_d),{autoClose: false})      
            if(deleteEntry != "") {
              //this.alert.success(deleteEntry + "|" + JSON.stringify(options_d),{autoClose: false})
              let found = options_d.findIndex(b => b == deleteEntry) 
              if(found > -1) {
                options_d.splice(found,1)
              }
            }
          }
        });
      }
      //this.alert.warn(JSON.stringify(options_d),{autoClose: false});
      if(options_d.length == 0) {
        let sfparts = sfsections[g].split(new RegExp("("+ this.punctuationPattern + ")","u")); 
        //this.alert.success(JSON.stringify(sfparts),{autoClose: false});
        for(let h = 0; h < sfparts.length; h++) {
          let search_text = sfparts[h];
          let options = new Array<string>();
          let text_normal = this.cjkNormalize(search_text);
          let text_normal_wgpy = this.cjkNormalize(this.wadegiles.WGtoPY(search_text));    
          let search_keys = [search_text,text_normal,text_normal_wgpy];
          for(let i = 0; i < search_keys.length; i++) {
            let ki = search_keys[i];
            if(ki.length == 0) {
              continue;
            }
            if(options.length > 0) {
              break;
            }
            await this.storeService.get(ki).toPromise().then((res) => {
              if(res) {
                options = res.map(a => a.text);
              }
            });
          }    
          //this.alert.warn(JSON.stringify(options),{autoClose: false})
          if(options.length == 0)  {
            let rlen = this.relator_terms.relator_keys_pinyin.length;
            for(let i = 0; i < rlen; i++) {      
              let relator = this.relator_terms.relator_keys_pinyin[i];
              let relator_wgpy = this.wadegiles.WGtoPY(relator);
              let relator_lookup = this.relator_terms.lookup(relator);
              let relator_wgpy_lookup = this.relator_terms.lookup(relator_wgpy);

              if(options.length > 0) {
                break;
              }
              await this.storeService.get(text_normal + relator).toPromise().then((res) => {
                options = res.map(a => a.text.replace(
                  new RegExp("(" + relator_lookup + ")(\\p{P}*$","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(relator + text_normal).toPromise().then((res) => {
                options = res.map(a => a.text.replace(
                  new RegExp("(" + relator_lookup + ")","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(text_normal_wgpy + relator_wgpy).toPromise().then((res) => {
                options = res.map(a => a.text.replace(
                  new RegExp("(" + relator_wgpy_lookup + ")(\\p{P}*$","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(relator_wgpy + text_normal_wgpy).toPromise().then((res) => {
                options = res.map(a => a.text.replace(
                  new RegExp("(" + relator_wgpy_lookup + ")","")
                ));
              });

              if(options.length > 0) {
                break;
              }
              let trunc = text_normal.replace(new RegExp("^(" + relator + ")"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res.map(a => relator_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });

              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("(" + relator + ")$"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res.map(a => relator_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });
              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("^(" + relator_wgpy + ")"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res.map(a => relator_wgpy_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });

              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("(" + relator_wgpy + ")$"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res.map(a => relator_wgpy_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });
            }
          }
          if(options.length == 0) {
            options = [search_text];
          }
          //this.alert.warn(JSON.stringify(options),{autoClose: false})
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
    //this.alert.info(JSON.stringify(options_final),{autoClose: false})
    }
    //this.alert.success(JSON.stringify(options_final),{autoClose: false});
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
    //this.alert.success(JSON.stringify(options_final),{autoClose: false});
    return options_final;
}

  addParallelDictToStorage() {
    this.lookupComplete = new Promise((resolve) => {
    let storePairs: DictEntry[] = [];    
    let storePairs2: DictEntry[] = []
    this.parallelDict.forEach((entry, key) => {
      entry.consolidate()
      storePairs.push(entry);
      storePairs2.push(entry);
    });
    
    let getOperations = from(storePairs).pipe(concatMap(entry => this.storeService.get(entry.key))
    )
    //this.alert.info(JSON.stringify(storePairs),{autoClose: false})
    this.statusString = "Finalizing..."
    
    getOperations.subscribe({
      next: (res) => {
        if(res != undefined) {  
          let prevPair = new DictEntry(res.key,res.variants,res.parallels);

          let newPair: DictEntry = storePairs.find(a => {return a.key == prevPair.key})
          //this.alert.warn(prevPair.stringify() + "<br>" + newPair.stringify(),{autoClose: false})
          prevPair.mergeWith(newPair) 
          //this.alert.success(prevPair.stringify() + "<br>" + newPair.stringify(),{autoClose: false})
          
          let i = storePairs2.findIndex(a => {return a.key == prevPair.key})
          storePairs2[i] = prevPair
        } 
      },
      complete: () => {        
        //this.alert.info(storePairs2.map(a => a.stringify()).join("<br><br>"),{autoClose: false})
        //this.alert.success(JSON.stringify(storePairs),{autoClose: false})
        let storeOperations = from(storePairs2).pipe(concatMap(entry => this.storeService.set(entry.key,entry)))
        storeOperations.subscribe({
            //next: (res) => this.alert.success(JSON.stringify(res),{autoClose: false}),
            //error: (err) => this.alert.error(err,{autoClose: false}),
            complete: () => {
              this.loading = false;
              resolve(true);
            }
          })
      //  this.alert.success(JSON.stringify(storePairs),{autoClose: false})
      }
    })
  })
  }

  parallelDictToString(): string {
    //return "done"
    let resultString = "";
    if(this.parallelDict.size == 0) {
      return resultString
    }
    this.parallelDict.forEach((entry, key) => {
      resultString += "<strong>" + key + "</strong>" + "<br/>";
      resultString += "<em>"
      entry.variants.forEach(v => {
        resultString += v + ","
      })
      resultString += "</em><br/>"
      entry.parallels.forEach(v => {
        resultString += v.text + ":" + v.count +  "<br/>";
      });
      resultString += "<br/>";
    });
    return resultString;
  }
  oclcNSresolver(prefix: string): string {
    let ns = {
      'srw' : 'http://www.loc.gov/zing/srw/',
      'marc' : 'http://www.loc.gov/MARC21/slim'
    }
    return ns[prefix] || null;
  }

  extractParallelFields(xml: string): void {    
    //this.alert.info(xml,{autoClose: false})
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
        //this.alert.info(value.map<string>((str) => str.innerHTML).join("<br>"))
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
            //this.alert.info(text_rom + "<br>" + text_nonrom,{autoClose: false})
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
              if(text_rom != text_nonrom) { //&& text_nonrom.match(this.cjk_re)  
                            
                this.addToParallelDict(text_rom_normal,text_nonrom,[text_rom_wgpy_normal]);   
                this.addToParallelDict(text_nonrom_normal,text_rom_stripped);   
                //this.addToParallelDict(text_rom_wgpy_normal,text_nonrom);
                this.relator_terms.relator_keys_pinyin.forEach((relator) => {
                    let relator_wgpy = this.wadegiles.WGtoPY(relator);
                    let relator_nonrom = this.relator_terms.lookup(relator);
                    if(text_rom_normal.match(new RegExp("^(" + relator + ")")) && 
                          text_nonrom.match(new RegExp("^(" + relator_nonrom + ")"))) {
                      text_rom_normal = text_rom_normal.replace(new RegExp("^(" + relator + ")"),"");
                      text_nonrom = text_nonrom.replace(new RegExp("^(" + relator_nonrom + ")"),"");
                      this.addToParallelDict(text_rom_normal,text_nonrom);
                      return;
                    } else if(text_rom_normal.match(new RegExp("(" + relator + ")$")) &&
                          text_nonrom.match(new RegExp("(" + relator_nonrom + ")$"))) {
                      text_rom_normal = text_rom_normal.replace(new RegExp("(" + relator + ")$"),"");
                      text_nonrom_normal = text_nonrom_normal.replace(new RegExp("(" + relator_nonrom + ")$"),"");
                      this.addToParallelDict(text_rom_normal,text_nonrom);
                      return;
                    } else if(text_rom_wgpy_normal.match(new RegExp("^(" + relator_wgpy + ")")) && 
                                   text_nonrom_normal.match(new RegExp("^(" + relator_nonrom + ")"))) {
                      text_rom_wgpy_normal = text_rom_normal.replace(new RegExp("^(" + relator + ")"),"");
                      text_nonrom = text_nonrom.replace(new RegExp("^(" + relator_nonrom + ")"),"");
                      this.addToParallelDict(text_rom_wgpy,text_nonrom);
                      return;
                    } else if(text_rom_wgpy_normal.match(new RegExp("(" + relator_wgpy + ")$")) &&
                      text_nonrom.match(new RegExp("(" + relator_nonrom + ")$"))) {
                      text_rom_wgpy_normal = text_rom_normal.replace(new RegExp("(" + relator_wgpy + ")$"),"");
                      text_nonrom_normal = text_nonrom_normal.replace(new RegExp("(" + relator_nonrom + ")$"),"");
                      this.addToParallelDict(text_rom_wgpy_normal,text_nonrom);
                      return;
                    }
                });
              }
            } else {
              
              for(let m = 0; m < text_rom_parts.length; m++) {
                let rpm = text_rom_parts[m];
                let rpm_wgpy = this.wadegiles.WGtoPY(rpm);
                let cpm = text_nonrom_parts[m];
                let rpm_normal = this.cjkNormalize(rpm);
                let rpm_wgpy_normal = this.cjkNormalize(rpm_wgpy);
                let cpm_normal = this.cjkNormalize(cpm);

                //this.alert.success(rpm_normal + "<br>" + cpm_normal,{autoClose: false})  

                if(!rpm.match(new RegExp("^" + this.delimiterPattern + "$","u")) && 
                    rpm_normal != cpm_normal) { // && text_nonrom.match(this.cjk_re)) {
                      this.addToParallelDict(rpm_normal,cpm);
                      this.addToParallelDict(cpm_normal,rpm);
                      this.addToParallelDict(rpm_wgpy_normal,cpm);
                }
                this.relator_terms.relator_keys_pinyin.forEach((relator) => {
                  let relator_wgpy = this.wadegiles.WGtoPY(relator);
                  let relator_nonrom = this.relator_terms.lookup(relator);
                  if(rpm_normal.match("^(" + relator + ")") && 
                         cpm.match("^(" + relator_nonrom + ")")) {
                    rpm_normal = rpm_normal.replace(new RegExp("^(" + relator + ")"),"");
                    cpm = cpm.replace(new RegExp("^(" + relator_nonrom + ")"),"");
                    this.addToParallelDict(rpm_normal,cpm);
                    return;
                  } else if(rpm_normal.match("(" + relator + ")$") && 
                              cpm.match("(" + relator_nonrom + ")$")) {
                    rpm_normal = rpm_normal.replace(new RegExp("(" + relator + ")$"),"");
                    cpm = cpm.replace(new RegExp("(" + relator_nonrom + ")$"),"");
                    this.addToParallelDict(rpm_normal,cpm);
                    return;
                  } else if(rpm_wgpy_normal.match("(" + relator_wgpy + ")$") && 
                            cpm.match("(" + relator_nonrom + ")$")) {
                    rpm_wgpy_normal = rpm_normal.replace(new RegExp("(" + relator_wgpy + ")$"),"");
                    cpm = cpm.replace(new RegExp("(" + relator_nonrom + ")$"),"");
                    this.addToParallelDict(rpm_wgpy_normal,cpm);
                    return;
                  } else if(rpm_wgpy_normal.match("(" + relator_wgpy + ")$") && 
                            cpm.match("(" + relator_nonrom + ")$")) {
                    rpm_wgpy_normal = rpm_normal.replace(new RegExp("(" + relator + ")$"),"");
                    cpm = cpm.replace(new RegExp("(" + relator_nonrom + ")$"),"");
                    this.addToParallelDict(rpm_wgpy_normal,cpm);
                    return;
                  }
                });
              }
            }      
          }
        }           
      });
    }
  }

addToParallelDict(textA: string, textB: string, variants: string[] = []): void {
    if(textA == textB) {
      return;
    }
    if(!this.parallelDict.has(textA)) {
      this.parallelDict.set(textA,new DictEntry(textA,[],[]));
    }
    let entry = this.parallelDict.get(textA)
    entry.addVariant(textA)
    variants.forEach(v =>  {
      entry.addVariant(v)
    })
    entry.addParallel(textB,1)
    entry.variants.forEach(v => {
      if(v != textA) {
        this.parallelDict.set(v,entry)
      }
    })
  }

  lookupSubfields(fkey: string) {
    //this.alert.warn(fkey,{autoClose: false})
    //this.alert.info(this.parallelDictToString(),{autoClose: false})
    //if(!this.subfield_options.has(fkey)) {
      let sfo = new Map<string, Array<string>>();
      let pfkey = fkey;
      if(pfkey.substring(pfkey.length-1) == "P") {
        pfkey = pfkey.substring(0,pfkey.length - 1);
      } else {
        pfkey = pfkey + "P";
      }
      let main_field = this.fieldTable.get(fkey)
      let parallel_field = this.fieldTable.get(pfkey);
      
      let subfields = parallel_field.subfields;
      for(let i = 0; i < subfields.length; i++) {
        let sf = subfields[i]
        if(sf.code == '6' || sf.code == '0') {
          continue;
        }
        let opts = new Array();
        if(!this.settings.pinyinonly) {
          this.lookupInDictionary(sf.data).then((res) => {
            //this.alert.success(sf.data + "|" + JSON.stringify(res),{autoClose: false})
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
              
              //this.alert.success(fkey + "|" + JSON.stringify(opts),{autoClose: false})
              this.subfield_options.set(fkey, sfo);      
           }
          });
        } else {
          let pylookup = this.pinyin.lookup(sf.data,parallel_field.tag,parallel_field.ind1,sf.code);
          if(pylookup != sf.data && !opts.includes(pylookup)) {
            opts.push(pylookup);
          }
          if(!opts.includes(sf.data)) {
            opts.push(sf.data);
          }
          sfo.set(sf.id,opts);
          this.alert.success(fkey + "|" + JSON.stringify(sfo),{autoClose: false})
          this.subfield_options.set(fkey, sfo);
        }  
      }      
    //}
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
        //this.apiResult = result;
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
