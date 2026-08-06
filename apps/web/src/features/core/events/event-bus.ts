type Handler=(payload:unknown)=>void;

export class EventBus{

    private events=

        new Map<string,Handler[]>();

    on(

        event:string,

        handler:Handler

    ){

        const handlers=

            this.events.get(event)??[];

        handlers.push(handler);

        this.events.set(

            event,

            handlers

        );

    }

    emit(

        event:string,

        payload:unknown

    ){

        this.events.get(event)

            ?.forEach(

                h=>h(payload)

            );

    }

}