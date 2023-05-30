export type ListenerDestructor = () => void;

export default class Observer {
    protected listeners: {
        cmd: string,
        listeners: Function[]
    }[]

    constructor() {
        this.listeners = [];
    }

    /**
     * @returns unlisten
     * */
    listen(cmd: string, fn: Function): ListenerDestructor {
        var lc = this.listeners.find(x => x.cmd == cmd);
        if (!lc) {
            lc = {
                cmd,
                listeners: []
            };

            this.listeners.push(lc);
        }

        lc.listeners.push(fn);

        return () => (lc!.listeners.indexOf(fn) >= 0) && lc!.listeners.splice(lc!.listeners.indexOf(fn), 1);
    }

    hasListeners(cmd: string) {
        return !this.listeners.find(x => x.cmd == cmd && this.listeners.length);
    }

    fire(cmd: string, args: any[]) {
        return this.listeners
            .filter(x => x.cmd == cmd)
            .reduce<Function[]>((a, b) => [...a, ...b.listeners], [])
            .map(l => l.apply(cmd, args));
    };
}