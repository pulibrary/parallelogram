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
    public getQueryString(): string
    {
        let resultString = "";  
        this.paramsList.forEach(oqp => {
            if (resultString != "") {
                resultString += "+AND+";
            }
            if (oqp.matcher == "=") {
                oqp.matcher = "%3D";
            }
            oqp.value = oqp.value.replace("|","+");
            resultString += "srw." + oqp.index + "+" + oqp.matcher + "+%22" + encodeURI(oqp.value) + "%22";
        });
        return resultString;
    }    
}