import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Settings } from '../models/settings';

export class AuthUtils {
    constructor(private http: HttpClient) {}

    async getOAuthToken(authToken: String, wcKey: String, wcSecret: String): Promise<string> {
        let oauthURL = Settings.awsBaseURL + "token"
        let client_codes = window.btoa(wcKey + ":" + wcSecret)
        let tokenParams = new HttpParams().set('grant_type','client_credentials')
            .set('scope','WorldCatMetadataAPI')
        let token = await this.http.post(oauthURL,'',
        {
            headers: new HttpHeaders({
                'Accept': 'application/json',
                'X-Proxy-Host': Settings.oauthHost,
                'X-Proxy-Auth': client_codes,
                'Authorization': 'Bearer ' + authToken
            }),    
        params: tokenParams,        
        responseType: 'text'
        }).toPromise().then(res => {
            let resOBJ = JSON.parse(res)
            if('access_token' in resOBJ) {
                return resOBJ['access_token']
            }
        }).catch(err => {
            return null
        })
        return token
    }
  }