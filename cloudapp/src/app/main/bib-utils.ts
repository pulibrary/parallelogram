import { CloudAppRestService, HttpMethod } from "@exlibris/exl-cloudapp-angular-lib";
import {MarcDataField} from './marc-datafield';
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

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


  constructor(restService: CloudAppRestService) {
    this._restService = restService;
  }

  /** Retrieve a single BIB record */
  getBib (mmsId: string) {
    return this._restService.call<Bib>(`/bibs/${mmsId}`);
  }   

  getBibField(bib: Bib, field: String, subfield?: String) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let xpath = "/record/datafield[@tag='" + field + "']";

    if(field.substr(0,2) == "00") {
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

  getDatafields( bib: Bib ): Map<string,MarcDataField> {
    let fieldTable = new Map<string,MarcDataField>();
    let parallelTable = new Map<string,string>();
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tagCount = new Map<string,number>();

    let dfields = doc.getElementsByTagName("datafield");
    for(let i = 0; i < dfields.length; i++) {
      let field = dfields[i];
      let mdf = new MarcDataField(field.getAttribute("tag"),
              field.getAttribute("ind1"),field.getAttribute("ind2"));
      
      if(!tagCount.has(mdf.tag)) {
        tagCount.set(mdf.tag,0);
      }
      let id = mdf.tag + ":" + tagCount.get(mdf.tag);
      tagCount.set(mdf.tag,tagCount.get(mdf.tag) + 1);

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
          let seq = data.substring(4,6);
          if(mdf.tag == "880") {
            id = parallelTable.get(seq) + "P";
          } else {
            parallelTable.set(seq,id);
          }
        }
      }
      fieldTable.set(id,mdf);
    }
    return fieldTable;
  }

  /** Update a BIB record with the specified MARCXML */
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

  replaceFieldInBib(bib: Bib, field_id: string, field: MarcDataField, parallel = false) {
    const doc = new DOMParser().parseFromString(bib.anies, "application/xml");
    let tag = field_id.substr(0,3);
    let tag_seq = field_id.substr(4);
    let target_field = doc.querySelectorAll("datafield[tag='"+tag+"']")[+tag_seq];

    if(parallel) {
      let linkage = target_field.querySelector("subfield[code='6']");
      if(linkage) {
        let linkageStr = linkage.innerHTML;
        let ptag = linkageStr.substr(0,3);
        let plink = linkageStr.substr(4,2);
        let parfields = doc.querySelectorAll("datafield[tag='"+ptag+"']");
        for(let i = 0; i < parfields.length; i++) {
           let linkageVal = parfields[i].querySelector("subfield[code='6']").innerHTML.substr(4,2);
           if(plink == linkageVal) {
              target_field = parfields[i];
              break;
           }
        }
      }
    }

    target_field.remove();

    const datafield = dom("datafield", { 
      parent: doc.documentElement, 
      attributes: [ ["tag", field.tag], ["ind1", field.ind1], ["ind2", field.ind2] ]
    });

    field.subfields.forEach(sf => {
      dom("subfield", { 
        parent: datafield, 
        text: sf.data, 
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
        text: sf.data, 
        attributes: [ ["code", sf.code] ]
      });
    });
    bib.anies = new XMLSerializer().serializeToString(doc.documentElement);
    return bib;
  }   
}

/** Adds Element to dom and returns it */
const dom = (name: string, options: {parent?: Element | Node, text?: 
  string, className?: string, id?: string, attributes?: string[][]} = {}
  ): Element => {

  let ns = options.parent ? options.parent.parentElement.namespaceURI : '';
  let element = document.createElementNS(ns, name);

  if (options.parent) options.parent.appendChild(element);
  if (options.text) element.innerHTML = options.text;
  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.attributes) options.attributes.forEach(([att, val]) => element.setAttribute(att, val));

  return element;  
}