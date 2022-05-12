import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders } from '@angular/common/http'; 
import { AlertService } from '@exlibris/exl-cloudapp-angular-lib';

@Injectable({
  providedIn: 'root'
})

export class PinyinService {

  pinyin: Map<string,string>;
  ready: Promise<boolean>;
  cjkPattern = "[\\p{sc=Han}]";
  cjk_re = new RegExp(this.cjkPattern,"u");
  alphanumPattern = "[\\p{L}\\p{N}\\p{M}]"; 
  maxChineseLen: number;

  constructor(private http: HttpClient, private alert: AlertService) {
    this.loadXML();
  }

   loadXML(): void
   {
    this.ready = new Promise((resolve) => {
    this.http.get('assets/pinyin.xml', {  
      headers: new HttpHeaders()  
        .set('Content-Type', 'application/xml')  
        .append('Access-Control-Allow-Methods', 'GET')  
        .append('Access-Control-Allow-Origin', '*')  
        .append('Access-Control-Allow-Headers', "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Access-Control-Request-Method"),  
        responseType: 'text'  
    }).toPromise().then((data) => {
      this.pinyin = this.parseXML(data);
      resolve(true);
    });
    });
   }

   parseXML(data: string) : Map<string,string> {
      let m = new Map<string,string>()
      const doc = new DOMParser().parseFromString(data, "application/xml");
      let entries = doc.getElementsByTagName("romanization");
      for(let i = 0; i < entries.length; i++) {
        let len = entries[i].getAttribute("characters").length;
        this.maxChineseLen = len > this.maxChineseLen ? len : this.maxChineseLen;
        m.set(entries[i].getAttribute("characters"),entries[i].getAttribute("pinyin"));
      }
      return m;    
   }

   public lookup(chinese: string, tag: string, ind1: string, code: string): string
   {
     //replace single dash between CJK chars with double
     let re = new RegExp("(" + this.cjkPattern + ")[-\uFF0D](" + this.cjkPattern + ")","u");
     chinese = chinese.replace(re, "$1--$2");
     let len = chinese.length;
     let pyresult = "";

     /*
      * Attempt to find the longest left-anchored substring of the subfield that matches an entry in the Romanization table.
      * Once it is found, convert to pinyin, and repeat the process on the remaining part of the subfield.
      * If none is found copy over one character as-is and resume with the next character.
      */
     for (let j = 0; j < len; j++) {
       let prevchar = "";
       if (j > 0) {
         prevchar = chinese.substring(j - 1, j);
       }
       let nextchar = chinese.substring(j, j + 1);
       let pyj = "";
       if (!nextchar.match(/[A-Za-z0-9 ]/)) { //don't bother with lookup if next character is alphanumeric
       /*
        * This loop tries to find the longest substring that is in the Romanization table.  It starts by 
        * looking for the string from index j to the end of the subfield.  It keeps on removing one character from the 
        * end until a match is found.
        */
        let max = (this.maxChineseLen < (len - j)) ? this.maxChineseLen : (len - j);
        for (let k = max ; k > 0; k--) {
          let sjk = chinese.substring(j, j + k);
          if (sjk.substring(sjk.length - 1) == " ") {
            continue;
          }
          //sjk = sjk.replace("'", "''");
          pyj = this.lookupEntry(sjk);
          if(pyj != sjk) {
            if (j == 0)  { //capitalize first character of subfield                                      
              pyj = pyj.substring(0, 1).toUpperCase() + pyj.substring(1);
            }
            j += k - 1;
            break;
          } 
        }
       }
       //various punctutation/spacing tweaks
       if (pyresult.length > 0 && pyj != " ") {
        let pyprev = pyresult.substring(pyresult.length- 1);
        let pynext = pyj.substring(0);
        re = new RegExp("(" + this.cjkPattern + this.alphanumPattern + 
          ")|(" + this.alphanumPattern + this.cjkPattern + ")","u");
        if ((prevchar + nextchar).match(re) ||
            (pyprev.match(/[,.-]/) && nextchar.match(this.cjk_re)) ||
            (pyprev.match(/[\]\)]/) && nextchar.match(this.cjk_re)) ||
            (prevchar.match(this.cjk_re) && pynext.match(/[\[\(]/)) ||
            (pyprev.match(/[\/:;]/) && nextchar.match(this.cjk_re)) ||
            (prevchar.match(this.cjk_re) && pynext.match(/[\/:-]/)) ||
            (pyprev == ")" && pynext == "(")
            ) {
              pyresult += " ";
          }
       }
        
       if (pyj.length > 0) {
        pyresult += pyj;
       } else {
        pyresult += nextchar;
       }
      }
      //capitalization/spacing tweaks
      let m = pyresult.match(/([;\(]\s*)([a-z])/);
      if(m) {
        pyresult = pyresult.replace(m[0],m[1] + m[2].toUpperCase());
      }

      m = pyresult.match(new RegExp('([\"\u201C])([^"\u201C\u201D]+)([\"\u201D])',"u"));
      if(m) {
        
        pyresult = pyresult.replace(m[0],m[1] + m[2].substring(0,1).toUpperCase() + m[2].substring(1) + m[3] + " ");
      }
    
      m = pyresult.match(new RegExp('([\'\u2018])([^\'\u2018\u2019]+)([\'\u2019])',"u"));
      if(m) {
        pyresult = pyresult.replace(m[0],m[1] + m[2].substring(0,1).toUpperCase() + m[2].substring(1) + m[3] + " ");
      }
      pyresult = this.processNumbers(pyresult,tag,code);

      if ((tag.match("[1678]00") && ind1 == "1" && code == "a") || code == "r") { //special formatting for personal names
        let possibleComma = ",";
        if(code == "r") { 
          possibleComma = "";
        }
        let possibleApos = "";
        let m = pyresult.match(/^((?:[a-z]\([^\)]*\) ?)?)(\S+)\s+(\S+)\s*(.*)$/);
        if(m) {
          if (m[4].length > 0 && m[4].substring(0,1).match(/[aeiou]/)) {
            possibleApos = "'";
          }
          pyresult = pyresult.replace(m[0],m[1] + m[2].substring(0,1).toUpperCase() + m[2].substring(1) + possibleComma + " " +
            m[3].substring(0,1).toUpperCase() + m[3].substring(1) + possibleApos + m[4]);
        }
      }
    //more spacing/capitalization tweaks
    pyresult = pyresult.replace(/\s\s+/, " ");
    pyresult = pyresult.replace(/^\s+/, "");
    m = pyresult.match(/^(\[)([a-z])/);
    if(m) {
      pyresult = pyresult.replace(m[0],m[1] + m[2].toUpperCase());
    }
    return pyresult;
   }

   private processNumbers(pinyinString: string, tag: string, code: string): string {
       let outputString = "";
       let useNumVersion = false;
       //useNumVersion is set in specific subfields where we definitely want to treat numbers as numbers
       if ((tag == "245" || tag == "830") && code == "n") {
          useNumVersion = true;
       }

       /*
        * The input string is split, with any space or punctuation character (except for #) as the delimiter.
        * The delimiters will be captured and included in the string of tokens.  Only the even-numbered
        * array elements are the true 'tokens', so the code for processing tokens is run only for even
        * values of j.
        */
       let tokens: string[] = pinyinString.split(new RegExp("([^\\P{P}#]|\\s)","u"));
       let numTokenPattern = "^([A-Za-z]+)#([0-9]*)$";
       let numToken_re = new RegExp(numTokenPattern);
       let n = tokens.length
       //this.alert.info(tokens.join("|"),{autoClose: false})
       for (let i = 0; i < n; i++) {
           let toki = tokens[i];
           if (toki.match(numToken_re)) {
               /*
                * When a numerical token (containing #) is reached, the inner loop consumes it and all consecutive numerical tokens
                * found after it.  Two versions of the string are maintained.  The textVersion is the original pinyin (minus the
                * # suffixes).  In the numVersion, characters representing numbers are converted to Arabic numerals.  When a 
                * non-numerical token (or end of string) is encountered, the string of numerical tokens is evaluated to determine
                * which version should be used in the output string.  The outer loop then continues where the inner loop left off.
                */
               let textVersion = "";
               let numVersion = "";
               for (let j = i; j < n; j++) {
                   let tokj = tokens[j];
                   /* a token without # (or the end of string) is reached */
                   if ((j % 2 == 0 && !tokj.match(numToken_re)) || j == n - 1) {
                       //If this runs, then we are on the last token and it is numeric. Add text after # (if present) to numerical version
                       let m = tokj.match(numToken_re);
                       if (m) {                         
                           textVersion += m[1]
                           if (m[2] == "") {
                               numVersion += m[1];
                           } else {
                               numVersion += m[2];
                           }
                       } else if (j == n - 1) {
                       //if last token is non-numerical, just tack it on.
                           textVersion += tokj;
                           numVersion += tokj;
                       } else if (textVersion.length > 0 && numVersion.length > 0) {
                       //if not at end of string yet and token is non-numerical, remove the last delimiter that was appended
                       //(outer loop will pick up at this point)
                           textVersion = textVersion.substring(0, textVersion.length - 1);
                           numVersion = numVersion.substring(0, numVersion.length - 1);
                       }
                       //evaluate numerical string that has been constructed so far
                       //use num version for ordinals and date strings
                       if (numVersion.match(/^di [0-9]/i) ||
                           numVersion.match(/[0-9] [0-9] [0-9] [0-9]/) ||
                           numVersion.match(/[0-9]+ nian [0-9]+ yue/i) ||
                           numVersion.match(/"[0-9]+ yue [0-9]+ ri/i) ||
                           useNumVersion
                          ) {
                           useNumVersion = true;
                           /*
                            * At this point, string may contain literal translations of Chinese numerals
                            * Convert these to Arabic numerals (for example "2 10 7" = "27"). 
                            */

                           while (numVersion.match(/[0-9] 10+/) || numVersion.match(/[1-9]0+ [1-9]/)) {
                               m = numVersion.match(/([0-9]+) ([1-9]0+)/);
                               if (m) {
                                   let sum = Number(m[1]) * Number(m[2]);
                                   numVersion = numVersion.replace(/[0-9]+ [1-9]0+/, String(sum));
                               } else {
                                   let mb = numVersion.match(/([1-9]0+) ([0-9]+)/);
                                   if (mb)
                                   {
                                       let sumb = Number(mb[1]) + Number(mb[2]);
                                       numVersion = numVersion.replace(/[1-9]0+ [0-9]+/, String(sumb));
                                   }
                                   else
                                   {
                                       break;
                                   }
                               }
                           }

                           //A few other tweaks
                           numVersion = numVersion.replace(/([0-9]) ([0-9]) ([0-9]) ([0-9])/g, "$1$2$3$4");
                           if ((tag == "245" || tag == "830") && code == "n") {
                               while (numVersion.match(/[0-9] [0-9]/)) {
                                   numVersion = numVersion.replace(/([0-9]) ([0-9])/, "$1$2");
                               }
                           }
                       }
                       if (useNumVersion)
                       {
                           outputString += numVersion;
                       }
                       else
                       {
                           outputString += textVersion;
                       }
                       //if the end of the string is not reached, backtrack to the delimiter after the last numerical token
                       //(i.e. two tokens ago)
                       if (j < n - 1)
                       {
                           i = j - 2;
                       }
                       else //we are at the end of the string, so we are done!
                       {
                           i = j;
                       }
                       break;
                   }

                   //this is run when we are not yet at the end of the string and have not yet reached a non-numerical token
                   //This is identical to the code that is run above when the last token is numeric.
                   if (j % 2 == 0)
                   {
                       let m = tokj.match(numToken_re);
                       textVersion += m[1];
                       if (m[2]== "")
                       {
                           numVersion += m[1];
                       }
                       else
                       {
                           numVersion += m[2];
                       }
                   }
                   else //a delimiter, just tack it on.
                   {
                       textVersion += tokj;
                       numVersion += tokj;
                   }
               }
           }
           else // the outer loop has encountered a non-numeric token or delimiter, just tack it on.
           {
               outputString += toki;
           }
       }
       return outputString;
   }
   
  public lookupEntry(chinese: string): string {
    let result = chinese;
    if(this.pinyin.has(chinese)) {
      result = this.pinyin.get(chinese);
    }
    return result;
  }
}