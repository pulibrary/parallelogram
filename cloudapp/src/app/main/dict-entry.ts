export class DictEntry {
    key: string
    variants: string[]
    parallels: Array<{text: string, count: number}>

    constructor(key: string, variants: string[], parallels: Array<{text: string, count: number}>) {
        this.key = key
        this.variants = variants
        this.parallels = parallels
    }

    addVariant(v: string) {
        if(this.variants.findIndex(a => v == a) == -1) {
            this.variants.push(v)
        }
    }
    addParallel(parallel: string, c = 0) {
        let found = this.parallels.findIndex(a => parallel == a.text)
        if(found > -1) {
            this.parallels[found] = {text: parallel, count: this.parallels[found].count + c}
        } else {
            this.parallels.push({text: parallel,count: c})
        }
    }

    deleteParallel(parallel: string): boolean {
        let found = this.parallels.findIndex(a => parallel == a.text)
        if(found > -1) {
            this.parallels.splice(found,1)
            return true;
        } else {
            return false;
        }
    }
    
    //getParallelArray(): Array<string> {
    //    //return this.parallels.
   // }

    consolidate() {
        this.parallels = this.parallels.filter((v,i,a) => a.findIndex(b => v.text == b.text) == i)
    }

    mergeWith(newEntry:DictEntry) {
        if(newEntry.key != this.key && !this.variants.includes(newEntry.key)) {
            this.variants.push(newEntry.key)
        }
        for(let i  = 0; i < newEntry.variants.length; i++) {
            if(!this.variants.includes(newEntry.variants[i])) {
                this.variants.push(newEntry.variants[i])
            }
        }
        for(let i = 0; i < newEntry.parallels.length; i++) {
            this.addParallel(newEntry.parallels[i].text,newEntry.parallels[i].count)
        }
    }

    isEqualTo(otherEntry: DictEntry) : boolean {
        if(this.key != otherEntry.key || this.variants.length != otherEntry.variants.length 
            || this.parallels.length != otherEntry.parallels.length) {
             return false
        }
        this.variants.sort()
        otherEntry.variants.sort()
        for(let i = 0; i < this.variants.length; i++) {
            if(this.variants[i] != otherEntry.variants[i]) {
                return false
            }
        }
        this.parallels.sort()
        otherEntry.parallels.sort()
        for(let i = 0; i < this.parallels.length; i++) {
            if(this.parallels[i].text != otherEntry.parallels[i].text) {
                return false
            }
        }
        return true
    }

    stringify(): string {
        return "key: " + this.key + "<br>variants: " + this.variants.join("|") + 
            "<br>parallels: " + this.parallels.map(a => "{" + a.text + ":" + a.count + "}").join(",")
    }
}