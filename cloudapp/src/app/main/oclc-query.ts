import {OclcQueryParams} from './oclc-query-params';

export class OclcQuery {
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
    public getQueryString(type = "search"): string
    {
        let resultString = "";  
        for(let i = 0; i < this.paramsList.length; i++) {
            let oqp = this.paramsList[i]
            if (resultString != "") {
                resultString += "+AND+";
            }
            if(type == "search") { //search API
                if (oqp.matcher == "=") {
                    oqp.matcher = "%3D";
                }
                oqp.value = oqp.value.replace("|","+");
                resultString += "srw." + oqp.index + "+" + oqp.matcher + "+%22" + encodeURI(oqp.value) + "%22";
            } else { //metadata API
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
                        resultString += "+OR+"
                    }
                    resultString += oqp.index + oqp.matcher + encodeURI(vals[i]) 
                }
                if(vals.length > 1) {
                    resultString += "%29"
                }
            }
        }
        return resultString;
    }    
}