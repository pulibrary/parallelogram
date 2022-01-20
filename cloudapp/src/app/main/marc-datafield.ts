export class MarcDataField {
    tag: string;
    ind1: string;
    ind2: string;
    subfields: Array<{id: string, code: string, data: string}>;

    constructor(tag: string, ind1: string, ind2: string) {
        this.tag = tag;
        this.ind1 = ind1;
        this.ind2 = ind2;
        this.subfields = new Array();
    }
    addSubfield(id: string, code: string, data: string, front: boolean = false) {
        if(front) {
            this.subfields.unshift({id: id, code: code, data: data});
        } else {
            this.subfields.push({id: id, code: code, data: data});
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
    getSubfieldString(): string {
        let sfstring = "";
        this.subfields.forEach(sf => {
            sfstring += "$" + sf.code + " " + sf.data + " ";
        });
        return sfstring;
    }
}