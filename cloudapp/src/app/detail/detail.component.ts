import { NgIfContext, PathLocationStrategy } from '@angular/common';
import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import { CloudAppStoreService,CloudAppRestService,AlertService,CloudAppSettingsService} 
  from '@exlibris/exl-cloudapp-angular-lib';
import { identity, Observable, from } from 'rxjs';
import { defaultIfEmpty, find, timestamp } from 'rxjs/operators';
import { Bib, BibUtils } from '../main/bib-utils';
import { MainComponent } from '../main/main.component';
import { MarcDataField } from '../main/marc-datafield';
import { Settings } from '../models/settings';
import { PinyinService } from '../pinyin.service';
import { WadegilesService } from '../wadegiles.service';
import { RelatorTermsService } from '../relator_terms.service';
//import { OpenCC } from 'opencc';
import { MissingTranslationHandler } from '@ngx-translate/core';
import { MatCommonModule } from '@angular/material/core';


@Component({
  selector: 'app-detail',
  templateUrl: './detail.component.html',
  styleUrls: ['./detail.component.scss']
})
export class DetailComponent implements OnInit {
  mms_id: string;
  field_id: string;
  main_field: MarcDataField;
  parallel_field: MarcDataField;
  lookup_fields: Map<string, Array<string>>;

  private bibUtils: BibUtils;
  private bib: Bib;
  private fieldTable: Map<string,MarcDataField>;
  private settings: Settings;
  //private chiTrad: OpenCC;
  //private chiSimp: OpenCC;

  cjkPattern = "[\\p{sc=Han}]";
  cjk_re = new RegExp(this.cjkPattern,"u");

  etalPattern = "(\\[?(\\.\\.\\.)? ?((\\[?(et al\\.?)|( and others)\\]?)))";
  etal_re = new RegExp(this.etalPattern,"u");

  //punctuationPattern = "[^\\P{P},]"
  punctuationPattern = "[^\\P{P}\\p{Ps}\\p{Pe}\\p{Pi}\\p{Pf}]";
  punctuation_re = new RegExp(this.punctuationPattern,"u");

  delimiterPattern = "(?:\\s|" + this.punctuationPattern + ")*(?:(?:\\$.)|[:;\\/=])+(?:\\s|" 
  + this.punctuationPattern + ")*";
delimiter_re = new RegExp(this.delimiterPattern,"u");

  @ViewChild('parallelOptions',{static: false}) parallelOptionsTable: ElementRef;
  
  constructor(private route: ActivatedRoute, 
    private router: Router,
    private restService: CloudAppRestService,
    private storeService: CloudAppStoreService,
    private alert: AlertService,
    private settingsService: CloudAppSettingsService,
    private pinyin: PinyinService,
    private wadegiles: WadegilesService,
    private relator_terms: RelatorTermsService) { 
  }

  ngOnInit(): void {
    this.settingsService.get().subscribe(stgs => {
      this.settings = stgs as Settings;
    });
    this.pinyin.ready.then((pyready) => {
    this.wadegiles.ready.then((wgready) => {
    this.relator_terms.ready.then((rtready) => {

    //this.chiSimp = new OpenCC('t2s.json')
    //this.chiTrad = new OpenCC('s2t.json')

    this.mms_id = this.route.snapshot.params['mms_id'];
    this.field_id = this.route.snapshot.params['field_id'];
    this.bibUtils = new BibUtils(this.restService);
    this.bibUtils.getBib(this.mms_id).subscribe(bib=> {
      this.bib = null;
      if(bib.record_format=='marc21') {
        this.bib = bib;
        this.fieldTable = this.bibUtils.getDatafields(bib);
        this.main_field = this.fieldTable.get(this.field_id);
        let parallel_field_id = this.field_id;
        if(parallel_field_id.substr(-1,1) == "P") {
          parallel_field_id = parallel_field_id.substr(0,parallel_field_id.length - 1);
        } else {
          parallel_field_id = parallel_field_id + "P";
        }
        this.parallel_field = new MarcDataField("880",this.main_field.ind1,this.main_field.ind2);
        if(this.fieldTable.has(parallel_field_id)) {
          this.parallel_field = this.fieldTable.get(parallel_field_id);
        }
        this.lookup_fields = new Map<string, Array<string>>();
        this.main_field.subfields.forEach(sf => {
          if(sf.code == '6') {
            return;
          }
          let options = new Array<string>();
          if(!this.settings.pinyinonly) {
            this.lookupInDictionary(sf.data).then((res) => {
              res.forEach((str) => {
                //this.alert.warn(str);
                options.push(str); 
              });
            }).finally(() => {
              if(!options.includes(sf.data)) {
                options.push(sf.data);
              }
            });
          } else {
            let tag = (this.main_field.tag == "880") ? this.parallel_field.tag : this.main_field.tag;
            let pylookup = this.pinyin.lookup(sf.data,tag,this.main_field.ind1,sf.code);
            if(pylookup != sf.data && !options.includes(pylookup)) {
              options.push(pylookup);
            }
            /*
            options.forEach(opt => {
              let trad = this.chiTrad.convertSync(opt);
              if(!options.includes(trad)) {
                options.push(trad)
              }
              let simp  = this.chiSimp.convertSync(opt);
              if(!options.includes(simp)) {
                options.push(simp)
              }
            })
            */
            if(!options.includes(sf.data)) {
              options.push(sf.data);
            }
            
          }
          this.lookup_fields.set(sf.id,options);
        });
      }
    });
  });
  });
  });
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

  async lookupInDictionary(sfdata: string): Promise<Array<string>> {
    //this.alert.info(sfdata)
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
      sfdata = sfdata.substr(0,sfdata.length - suffix.length);
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
        //this.alert.info(hi,{autoClose: false});
        if(hi.length == 0) {
          continue;
        }
        if(options_d.length > 0) {
          break;
        }
        await this.storeService.get(hi).toPromise().then((res) => {
          if(res) {
          //this.alert.success(JSON.stringify(res),{autoClose: false});
            options_d = res[0].map(a => a.text);
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
                options = res[0].map(a => a.text);
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
                options = res[0].map(a => a.text.replace(
                  new RegExp("(" + relator_lookup + ")(\\p{P}*$","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(relator + text_normal).toPromise().then((res) => {
                options = res[0].map(a => a.text.replace(
                  new RegExp("(" + relator_lookup + ")","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(text_normal_wgpy + relator_wgpy).toPromise().then((res) => {
                options = res[0].map(a => a.text.replace(
                  new RegExp("(" + relator_wgpy_lookup + ")(\\p{P}*$","")
                ));
              });
              if(options.length > 0) {
                break;
              }
              await this.storeService.get(relator_wgpy + text_normal_wgpy).toPromise().then((res) => {
                options = res[0].map(a => a.text.replace(
                  new RegExp("(" + relator_wgpy_lookup + ")","")
                ));
              });

              if(options.length > 0) {
                break;
              }
              let trunc = text_normal.replace(new RegExp("^(" + relator + ")"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res[0].map(a => relator_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });

              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("(" + relator + ")$"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res[0].map(a => relator_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });
              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("^(" + relator_wgpy + ")"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res[0].map(a => relator_wgpy_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
              });

              if(options.length > 0) {
                break;
              }
              trunc = text_normal.replace(new RegExp("(" + relator_wgpy + ")$"),"");
              await this.storeService.get(trunc).toPromise().then((res) => {
                options = res[0].map(a => relator_wgpy_lookup.replace(new RegExp("\\|.*"),"")  + a.text)
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

  saveField() {
    let pot : HTMLTableElement = this.parallelOptionsTable.nativeElement;
    let subfields : NodeListOf<HTMLInputElement> = pot.querySelectorAll('input');
    let linkage = this.main_field.getSubfield("61");
    let newfield = new MarcDataField(this.parallel_field.tag,this.main_field.ind1,this.main_field.ind2); 
    if(linkage == "") {
      let seqno = this.findUnusedLinkage();
      let seq = this.main_field.tag + "-" + seqno;
      let seq880 = "880-" + seqno;
      this.main_field.addSubfield("61","6",seq880,true);
      newfield.addSubfield("61","6",seq);
    } else {
      let seqno = linkage.substr(4);
      let seq = this.main_field.tag + "-" + seqno;
      newfield.addSubfield("61","6",seq);
    }
    subfields.forEach(sf => {
      let code = sf.id.replace("input-","");
      newfield.addSubfield(code,code.substr(0,1),sf.value);
    });
    let useParallel = false;
    let fid = this.field_id;
    if(fid.substr(-1,1) == "P") {
      useParallel = true;
      fid = fid.substr(0,fid.length-1);
    }

    this.bibUtils.replaceFieldInBib(this.bib,fid,this.main_field,useParallel);
    if(linkage == "") {
      this.bibUtils.addFieldToBib(this.bib,newfield);
    } else {
      this.bibUtils.replaceFieldInBib(this.bib,fid,newfield,!useParallel);
    }
    this.parallel_field = newfield;
    this.bibUtils.updateBib(this.bib).subscribe(() => {
      this.alert.success("Record updated.");
    });
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

  flipFields(): void {
    let main_subfields = this.main_field.subfields;
    let parallel_subfields = this.parallel_field.subfields;
    for(let i = 0; i < main_subfields.length; i++) {
      let sfi = main_subfields[i];
      if(sfi.code == "6") {
        continue;
      }
      let t = {id: sfi.id, code: sfi.code,data: sfi.data};
      
      main_subfields[i].data = this.lookup_fields.get(sfi.id)[0];
      if(parallel_subfields.length > 0) {
        parallel_subfields[i] = t;
      }
      this.lookup_fields.set(sfi.id, [t.data]);
      
    }
  }
}
