import {OclcQueryParams} from './oclc-query-params';

export class OclcQuery {
    maxWords: number = 30
    paramsList: Array<OclcQueryParams>;
    
    constructor(index: string, matcher: string, value: string) {
        this.paramsList = new Array<OclcQueryParams>();
        this.paramsList.push(new OclcQueryParams(index, matcher, value));
    }
    public addParams(index: string, matcher: string, value: string)
    {
        let oqp: OclcQueryParams = new OclcQueryParams(index, matcher, value);
        this.paramsList.push(oqp);
    }
    public getQueryString(): string
    {
        let resultString = "";  
        let totalWords = 0
        for(let i = 0; i < this.paramsList.length && totalWords <= this.maxWords; i++) {
            let oqp = this.paramsList[i]
            let words = oqp.value.split(/ /)
            if(words.length + totalWords > this.maxWords) {
                var wordsSlice = words.slice(0,this.maxWords - totalWords)
                oqp.value = wordsSlice.join(" ")
            }
            words = oqp.value.split(/ /)
            totalWords += words.length
            if (resultString != "") {
                resultString += "%20AND%20";
            }
            if (oqp.matcher == "all" || oqp.matcher == "any") {
                oqp.matcher = "%3A"
            } else if(oqp.matcher == "=") {
                oqp.matcher = "%3D"
            } else if(oqp.matcher == "exact") {
                oqp.matcher = "%3D"
            } 
            let vals = oqp.value.split("|")
            if(vals.length > 1) {
                resultString += "%28"
            }
            for(let i =0; i < vals.length; i++) {
                if(i > 0) {
                    resultString += "%20OR%20"
                }
                resultString += oqp.index + oqp.matcher + encodeURI(vals[i]) 
            }
            if(vals.length > 1) {
                resultString += "%29"
            }
        }
        return resultString;
    }    
}