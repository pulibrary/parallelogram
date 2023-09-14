import { CloudAppRestService, AlertService, HttpMethod } from "@exlibris/exl-cloudapp-angular-lib";
import { MarcDataField } from './marc-datafield';

export interface Bib {
  link: string,
  mms_id: string;
  title: string;
  author: string;
  record_format: string;
  lccns: string;
  isbns: string;
  issns: string;
  oclcnos: string;
  names: string;
  anies: any;
}

export class BibUtils {
  private _restService: CloudAppRestService;
  private alert: AlertService;


  constructor(restService: CloudAppRestService,
    alert: AlertService ) {
    this._restService = restService;
    this.alert = alert;
  }

  getBib (mmsId: string) {
    return this._restService.call<Bib>(`/bibs/${mmsId}`);
  }   

  getBibField(bib: Bib, field: String, subfield?: String) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let xpath = "/record/datafield[@tag='" + field + "']";

    if(field.substring(0,2) == "00") {
      xpath.replace("datafield","controlfield");
    }
    if(subfield != null) {
      xpath += "/subfield[@code='" + subfield + "']";
    }

    let nodes = doc.evaluate(xpath,doc,
      null,XPathResult.ORDERED_NODE_ITERATOR_TYPE,null);
    let n = null;
    let result = "";
    while(n = nodes.iterateNext()) {
      if(result != "") {
        result += "|";
      }
      result += n.textContent;
    }
    return result;
  }
  extractOCLCnums(oclcnos: String) {
    let result = "";
    let ocArray = oclcnos.split("|");
    ocArray.forEach(ono => {
      if(ono.startsWith("(OCoLC)")) {
        ono = ono.replace(/^[^0-9]*/,"");
        ono = ono.replace(/[^0-9]*$/,"");
        if(result != "") {
          result += "|";
        }
        result += ono;
      }
    })
    return result;
  }

  getLanguageCode( bib: Bib ): string {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let field008 = doc.evaluate("/record/controlfield[@tag='008']",doc,null,
      XPathResult.ANY_UNORDERED_NODE_TYPE,null)
    let language = ""
      if(field008.singleNodeValue) {
        language = field008.singleNodeValue.textContent.substring(35,38)
      }
    return language
  }

  getDatafields( bib: Bib ): Map<string,MarcDataField> {
    let fieldTable = new Map<string,MarcDataField>();
    let parallelTable = new Map<string,string>();
    let unmatched = new Map<string, string>();
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tagCount = new Map<string,number>();

    let dfields = doc.getElementsByTagName("datafield");
    for(let i = 0; i < dfields.length; i++) {
      let field = dfields[i];
      let linkage = ""
      let mdf = new MarcDataField(field.getAttribute("tag"),
              field.getAttribute("ind1"),field.getAttribute("ind2"));

      let sf = field.getElementsByTagName("subfield");
      let sfindices = new Map<string, number>();
      for(let j = 0 ; j < sf.length; j++) {
        let sfj = sf[j];
        let code = sfj.getAttribute("code");
        let data = sfj.textContent;
        if(!sfindices.has(code)) {
          sfindices.set(code,0);
        }
        sfindices.set(code, sfindices.get(code)+1);
        let sfid = code + sfindices.get(code);

        mdf.addSubfield(sfid, code, data)
        if(code == "6") {
          linkage = data;          
        }
      }
      if(!tagCount.has(mdf.tag)) {
        tagCount.set(mdf.tag,0)
      }
      tagCount.set(mdf.tag,tagCount.get(mdf.tag) + 1)

      let true_tag = mdf.tag
      let seq = ""
      let id = ""
      if(linkage != "") {
        seq = linkage.substring(4,6)
        if(true_tag == "880" && seq != "00") {
          true_tag = linkage.substring(0,3)
        }
      }

      let pair_id = true_tag+seq
      if(parallelTable.has(pair_id)) {
        id = parallelTable.get(pair_id);
      } else {      
        if(mdf.tag == "880") {
          true_tag = "880"
        }
        let count = tagCount.get(true_tag)-1 
        id = true_tag + ":" + (count < 10 ? "0" : "") + count
        if(seq != "" && seq != "00") {
          parallelTable.set(pair_id,id)
        }        
      }
      if(seq != "" && seq != "00") {
        if(unmatched.has(id)) {
          unmatched.delete(id)
        } else {
          unmatched.set(id,mdf.tag)
        }
      }
      if(mdf.tag == "880" && true_tag != "880" && seq != "00" && seq != "") {
        id += "P"
      }    
      fieldTable.set(id,mdf);      
    }
    unmatched.forEach((tag,id) => { 
      let mdf = fieldTable.get(id);
      mdf.hasParallel = false
      fieldTable.set(id,mdf)           
    });   
    return fieldTable;
  }

  updateBib( bib: Bib ) {
    return this._restService.call<Bib>( {
      url: `/bibs/${bib.mms_id}`,
      headers: { 
        "Content-Type": "application/xml",
        Accept: "application/json" },
      requestBody: `<bib>${bib.anies}</bib>`,
      method: HttpMethod.PUT
    });
  }    

  replaceFieldInBib(bib: Bib, field_id: string, field: MarcDataField) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tag = field_id.substring(0,3);
    let tag_seq = field_id.substring(4,6);
    let parallel = (field_id.substring(6,7) == "P")
    let target_field = doc.querySelectorAll("datafield[tag='"+tag+"']")[+tag_seq];
    
    if(parallel) {
      let linkage = target_field.querySelector("subfield[code='6']");
      if(linkage) {
        let linkageStr = linkage.innerHTML;
        let ptag = linkageStr.substring(0,3);
        let plink = linkageStr.substring(4,6);
        let parfields = doc.querySelectorAll("datafield[tag='"+ptag+"']");
        for(let i = 0; i < parfields.length; i++) {
           let linkageVal = parfields[i].querySelector("subfield[code='6']").innerHTML.substring(4,6);
           if(plink == linkageVal) {
              target_field = parfields[i];
              break;
           }
        }
      }
    }

    let prevElement = target_field.nextSibling
    target_field.remove();

    const datafield = dom("datafield", { 
      parent: doc.documentElement, 
      insertBefore: prevElement,
      attributes: [ ["tag", field.tag], ["ind1", field.ind1], ["ind2", field.ind2] ]
    });    
    field.subfields.forEach(sf => {
      dom("subfield", { 
        parent: datafield, 
        text: this.xmlEscape(sf.data), 
        attributes: [ ["code", sf.code] ]
      });
    });

    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);   
    return bib;
  }

  addFieldToBib(bib: Bib, field: MarcDataField) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    const datafield = dom("datafield", { 
      parent: doc.documentElement, 
      attributes: [ ["tag", field.tag], ["ind1", field.ind1], ["ind2", field.ind2] ]
    });
    field.subfields.forEach(sf => {
      dom("subfield", { 
        parent: datafield, 
        text: this.xmlEscape(sf.data), 
        attributes: [ ["code", sf.code] ]
      });
    });
    
    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);    
    return bib;
  }  

  unlinkFields(bib: Bib, field_id: string) { 
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tag = field_id.substring(0,3);
    let tag_seq = field_id.substring(4,6);
    
    let main_field = doc.querySelectorAll("datafield[tag='"+tag+"']")[+tag_seq];
    let linkage = main_field.querySelector("subfield[code='6']").innerHTML.substring(4,6);
    
    let parallel_field: Element;

    let parfields = doc.querySelectorAll("datafield[tag='880']");
    for(let i = 0; i < parfields.length; i++) {
      let linkageElement = parfields[i].querySelector("subfield[code='6']")
      if(!linkageElement) {
        continue;
      }
      let linkageVal = linkageElement.innerHTML.substring(4,6);
      if(linkage == linkageVal && linkageVal != "00") {
        parallel_field = parfields[i];
        break;
      }
    }
    
    main_field.querySelector("subfield[code='6']").remove();
    let plink = parallel_field.querySelector("subfield[code='6'").innerHTML
    parallel_field.querySelector("subfield[code='6'").innerHTML = plink.replace(/^(...)-../,"$1-00");
    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);
    return bib;
  }

  deleteField(bib: Bib, field_id: string) {
    if(field_id.substring(6,7) != "P") {
      this.swapParallelFields(bib,field_id)
    }
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tag = field_id.substring(0,3);
    let tag_seq = field_id.substring(4,6);
    
    let main_field = doc.querySelectorAll("datafield[tag='"+tag+"']")[+tag_seq];
    let linkage = main_field.querySelector("subfield[code='6']").innerHTML.substring(4,6);
    
    let parallel_field: Element;

    let parfields = doc.querySelectorAll("datafield[tag='880']");
    for(let i = 0; i < parfields.length; i++) {
      let linkageElement = parfields[i].querySelector("subfield[code='6']")
      if(!linkageElement) {
        continue;
      }
      let linkageVal = linkageElement.innerHTML.substring(4,6);
      if(linkage == linkageVal && linkageVal != "00") {
        parallel_field = parfields[i];
        break;
      }
    }
    
    main_field.querySelector("subfield[code='6']").remove();
    parallel_field.remove();
    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);
    return bib;
  }

  swapParallelFields(bib: Bib, field_id: string) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tag = field_id.substring(0,3);
    let tag_seq = field_id.substring(4,6);

    let target_field = doc.querySelectorAll("datafield[tag='"+tag+"']")[+tag_seq];
    let parallel_field: Element;

    let linkage = target_field.querySelector("subfield[code='6']").innerHTML.substring(4,6);

    let parfields = doc.querySelectorAll("datafield[tag='880']");
    for(let i = 0; i < parfields.length; i++) {
      let linkageElement = parfields[i].querySelector("subfield[code='6']")
      if(!linkageElement) {
        continue;
      }
      let linkageVal = linkageElement.innerHTML.substring(4,6);
      if(linkage == linkageVal && linkageVal != "00") {
        parallel_field = parfields[i];
        break;
      }
    }
 
    let t = parallel_field.innerHTML
    parallel_field.innerHTML = target_field.innerHTML
    parallel_field.querySelector("subfield[code='6']").innerHTML = tag + "-" + linkage;

    target_field.innerHTML = t
    target_field.querySelector("subfield[code='6']").innerHTML = "880-" + linkage;

    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);
    return bib;
  }

  xmlEscape(str: string): string {
    return str.replace(/&/g, "&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/,"&#039;")
  } 
}

const dom = (name: string, options: {parent?: Element, insertBefore?: Node, text?: 
  string, className?: string, id?: string, attributes?: string[][]} = {}
  ): Element => {
  let ns = options.parent ? options.parent.namespaceURI : '';
  let element = document.createElementNS(ns, name);

  if (options.parent) {
    if(options.insertBefore) {
      options.parent.insertBefore(element,options.insertBefore)
    } else {
      options.parent.appendChild(element);
    }
  }
  if (options.text) element.innerHTML = options.text;
  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.attributes) options.attributes.forEach(([att, val]) => element.setAttribute(att, val));

  return element;  
}