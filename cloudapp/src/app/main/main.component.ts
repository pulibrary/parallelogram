import { concat, Observable, Subscription } from 'rxjs';
import { Component, OnInit, OnDestroy, ɵɵCopyDefinitionFeature } from '@angular/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod, CloudAppSettingsService,
  Entity, EntityType, PageInfo, RestErrorResponse, AlertService, CloudAppConfigService, 
  CloudAppStoreService,
} from '@exlibris/exl-cloudapp-angular-lib';
import {WadegilesService} from "../wadegiles.service"
import { Bib, BibUtils } from './bib-utils';
import { from } from 'rxjs';
import { elementAt, finalize, switchMap, concatMap, timeout, timestamp } from 'rxjs/operators';
import { HttpClient, HttpHeaders, JsonpClientBackend } from '@angular/common/http';
import { ReactiveFormsModule } from '@angular/forms';
import { Settings } from '../models/settings';
import {OclcQuery} from './oclc-query';
import {MarcDataField} from './marc-datafield';
import { SettingsComponent } from '../settings/settings.component';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { RelatorTermsService } from '../relator_terms.service';

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
  completedSearches = 0;
  totalSearches = 0;
  private bibUtils: BibUtils;
  private settings: Settings;
  bib: Bib;
  fieldTable: Map<string,MarcDataField>;
  parallelDict: Map<string, Map<string, number>>;
  statusString: string = "";
  doSearch: boolean = true;
  searchProgress: number = 0;

  punctuationPattern = "[^\\P{P}\\p{Ps}\\p{Pe}\\p{Pi}\\p{Pf}\"\"\'\']";
  punctuation_re = new RegExp(this.punctuationPattern,"u");
  delimiterPattern = "(?:\\s|" + this.punctuationPattern + ")*(?:(?:\\$.)|[:;\\/=])+(?:\\s|" 
    + this.punctuationPattern + ")*";
  delimiter_re = new RegExp(this.delimiterPattern,"u");
  etalPattern = "(\\[?(\\.\\.\\.)? ?((\\[?(et al\\.?)|( and others)\\]?)))";
  etal_re = new RegExp(this.etalPattern,"u");
  cjkPattern = "[\\p{sc=Han}]";
  cjk_re = new RegExp(this.cjkPattern,"u");

  constructor(private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private settingsService: CloudAppSettingsService,
    private configService: CloudAppConfigService,
    private alert: AlertService,
    private storeService: CloudAppStoreService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private wadegiles: WadegilesService,
    private relator_terms: RelatorTermsService,
    private router: Router) { }

  ngOnInit() {
    this.settingsService.get().subscribe(stgs => {
      this.settings = stgs as Settings;
      if(this.settings.pinyinonly) {
        this.doSearch = false;
      } else if(!this.settings.wckey) {   
        this.router.navigate(['settings'],{relativeTo: this.route})
        return;
      } 
    });
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    this.parallelDict = new Map();    
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
    this.bibUtils = new BibUtils(this.restService,this.alert);
    this.pageEntities = (pageInfo.entities||[]).filter(e=>[EntityType.BIB_MMS, 'IEP', 'BIB'].includes(e.type));
    if ((pageInfo.entities || []).length == 1) {
      const entity = pageInfo.entities[0];
      this.bibUtils.getBib(entity.id).subscribe(bib=> {
        this.bib = null;
        if(bib.record_format=='marc21') {
          this.bib = bib;
          this.extractParallelFields(this.bib.anies);
          this.addParallelDictToStorage();
          this.fieldTable = this.bibUtils.getDatafields(bib);
          if(this.doSearch) {
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
               this.statusString = "Searching WorldCat: 0% complete";
            }    
            
            oclcQueries.map(oq => this.getOCLCrecords(oq));
         } 
        }
      })
    } else {
      this.apiResult = {};
    }
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
      res => {
        this.extractParallelFields(res);
      },
      err => this.alert.error(err.message),
      () => {
        this.completedSearches++;
        this.searchProgress = Math.floor(this.completedSearches*100/this.totalSearches);
        this.statusString = "Searching WorldCat: " + this.searchProgress  + "% complete";
        if(this.completedSearches == this.totalSearches) {
          this.addParallelDictToStorage("Completed Searching WorldCat Records");
        }
      }
    )
  }

  addParallelDictToStorage(status: string = "") {
    let storePairs = [];
    this.parallelDict.forEach((value, textA) => {
      let entry = [];
      value.forEach((count,textB) => {
        entry.push({text: textB, count: count});
      });
      storePairs.push({key: textA,value: entry});
    });
    let storeOperations = storePairs.map(
      kv => this.storeService.set(kv['key'],[kv['value']])
    );
    concat(...storeOperations).subscribe({
      complete: () => {
        this.loading = false;
        this.statusString = status;
      }
    })
  }

  parallelDictToString(): string {
    let resultString = "";
    this.parallelDict.forEach((entry, key) => {
      resultString += "<strong>" + key + "</strong>" + "<br/>";
      entry.forEach((entry2, key2) => {
        resultString += entry2 + ":" + key2 + "<br/>";
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
                            
                this.addToParallelDict(text_rom_normal,text_nonrom);   
                this.addToParallelDict(text_nonrom_normal,text_rom_stripped);   
                this.addToParallelDict(text_rom_wgpy_normal,text_nonrom);
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

addToParallelDict(textA: string, textB: string): void {
    //this.alert.info(textA + "<br>" + textB,{autoClose: false})
    if(textA == textB) {
      return;
    }
    if(!this.parallelDict.has(textA)) {
      this.parallelDict.set(textA,new Map<string, number>());
    }
    if(!this.parallelDict.get(textA).has(textB)) {
      this.parallelDict.get(textA).set(textB,1);
    } else {
      this.parallelDict.get(textA).set(textB, this.parallelDict.get(textA).get(textB) + 1);
    }

    //if(!this.parallelDict.has(textB)) {
    //  this.parallelDict.set(textB,new Map<string, number>());
    //}
    //if(!this.parallelDict.get(textB).has(textA)) {
    //  this.parallelDict.get(textB).set(textA,1);
    //} else {
    //  this.parallelDict.get(textB).set(textA, this.parallelDict.get(textB).get(textA) + 1);
    //}
    
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
