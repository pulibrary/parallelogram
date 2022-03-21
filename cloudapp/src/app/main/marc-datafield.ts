export class MarcDataField {
    tag: string;
    ind1: string;
    ind2: string;
    subfields: Array<{id: string, code: string, data: string}>;
    hasParallel: boolean;

    constructor(tag: string, ind1: string, ind2: string) {
        this.tag = tag;
        this.ind1 = ind1;
        this.ind2 = ind2;
        this.subfields = new Array();
        this.hasParallel = false;
    }
    addSubfield(id: string, code: string, data: string, front: boolean = false) {
        if(front) {
            this.subfields.unshift({id: id, code: code, data: data});
        } else {
            this.subfields.push({id: id, code: code, data: data});
        }
        if(code == '6' && data.match(/[0-9][0-9][0-9]-[0-9][0-9]/)) {
            this.hasParallel = true;
        }
    }
    getSubfield(id: string): string {
        for(let i = 0; i < this.subfields.length; i++) {
            if(id == this.subfields[i].id) {
                return this.subfields[i].data;
            }
        }
        return "";
    }
    setSubfield(id: string, value: string) {
        for(let i = 0; i < this.subfields.length; i++) {
            if(id == this.subfields[i].id) {
                this.subfields[i].data = value
            }
        }
        return "";
    }
    
    deleteSubfield(sfid) {
        this.subfields = this.subfields.filter(a => a.id != sfid)
    }

    getSubfieldString(): string {
        let sfstring = "";
        this.subfields.forEach(sf => {
            //if(sf.code == '6') {
                //return;
            //}
            sfstring += "$" + sf.code + " " + sf.data + " ";
        });
        return sfstring;
    }
}