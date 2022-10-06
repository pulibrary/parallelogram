export class Settings {
    static readonly awsBaseURL: string = "https://nga1cj08ih.execute-api.us-east-2.amazonaws.com/"
    static readonly wcBaseURL: string = Settings.awsBaseURL + "webservices/catalog/search/sru";
    static readonly wcMDBaseURL: string = Settings.awsBaseURL + "worldcat/search/brief-bibs"
    static readonly wcMDSingleBaseURL: string = Settings.awsBaseURL + "worldcat/manage/bibs"
    static readonly wcQueryParamName: string = "query"
    static readonly wcMDQueryParamName: string = "q"
    static readonly wcOtherParams: string = "&version=1.1&operation=searchRetrieve&recordSchema=info%3Asrw%2Fschema%2F1%2Fmarcxml&maximumRecords=100&startRecord=1&recordPacking=xml&servicelevel=full&sortKeys=relevance&resultSetTTL=300&recordXPath=&frbrGrouping=off"
    
    static readonly oauthHost: string = "oauth.oclc.org"
    static readonly locHost: string = "id.loc.gov"
    static readonly wcSearchHost: string = "worldcat.org"
    static readonly wcMetadataHost: string = "metadata.api.oclc.org"

    wcKeyType: string = "search"
    wckey: string = "";
    wcsecret: string = "";
    pinyinonly: boolean = false;
    searchWG: boolean = false;
    doPresearch: boolean = false;
    doSwap: boolean = false;
    swapType: string = "nonroman"
    preSearchList: Array<string> = ["1xx","245","26x","7xx"]
    preferInstitutions: boolean = false;
    preferredInstitutionList: Array<string> = ["DLC"]
    interfaceLang: string = ""
    adminWC: boolean = false;
    adminLock: boolean = false;
}