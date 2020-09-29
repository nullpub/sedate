import * as H from "https://deno.land/std@0.71.0/http/mod.ts";
import * as TE from "https://deno.land/x/hkts@v0.0.15/task_either.ts";
import * as E from "https://deno.land/x/hkts@v0.0.15/either.ts";
import { isNotNil, pipe } from "https://deno.land/x/hkts@v0.0.15/fns.ts";

import {
  Connection,
  HeadersOpen,
  Middleware,
  ResponseEnded,
  Status,
  execMiddleware,
} from "./sedate.ts";
import { ServerRequest } from "https://deno.land/std@0.71.0/http/mod.ts";

/***************************************************************************************************
 * @section Utilities
 **************************************************************************************************/

export type LinkedList<A> =
  | { type: "Nil"; length: number }
  | { type: "Cons"; head: A; tail: LinkedList<A>; length: number };

export const nil: LinkedList<never> = { type: "Nil", length: 0 };

export const cons = <A>(head: A, tail: LinkedList<A>): LinkedList<A> => ({
  type: "Cons",
  head,
  tail,
  length: tail.length + 1,
});

export const toArray = <A>(list: LinkedList<A>): Array<A> => {
  const len = list.length;
  const r: Array<A> = new Array(len);
  let l: LinkedList<A> = list;
  let i = 1;
  while (l.type !== "Nil") {
    r[len - i] = l.head;
    i++;
    l = l.tail;
  }
  return r;
};

const fromHeaders = (h: Headers): Record<string, string> =>
  Array.from(h.keys()).reduce((acc, key) => {
    const value = h.get(key);
    if (value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

export type Action =
  | { type: "setBody"; body: H.Response["body"] }
  | { type: "endResponse" }
  | { type: "setStatus"; status: Status }
  | { type: "setHeader"; name: string; value: string }
  | { type: "clearCookie"; name: string }
  | { type: "setCookie"; cookie: H.Cookie };

const endResponse: Action = { type: "endResponse" };

export class DenoConnection<S> implements Connection<S> {
  constructor(
    readonly req: H.ServerRequest,
    readonly res: H.Response,
    readonly actions: LinkedList<Action> = nil,
    readonly ended: boolean = false,
  ) {}

  chain<T>(action: Action, ended: boolean = false): DenoConnection<T> {
    return new DenoConnection<T>(
      this.req,
      this.res,
      cons(action, this.actions),
      ended,
    );
  }

  getRequest(): H.ServerRequest {
    return this.req;
  }

  getBody(): unknown {
    return this.req.body;
  }

  getHeader(name: string): unknown {
    return this.req.headers.get(name);
  }

  getParams(): unknown {
    throw new Error("Not Implemented!");
  }

  getQuery(): unknown {
    throw new Error("Not Implemented!");
  }

  getOriginalUrl(): string {
    return this.req.url;
  }

  getMethod(): string {
    return this.req.method;
  }

  setCookie(
    cookie: H.Cookie,
  ): DenoConnection<HeadersOpen> {
    return this.chain({ type: "setCookie", cookie });
  }

  clearCookie(
    name: string,
  ): DenoConnection<HeadersOpen> {
    return this.chain({ type: "clearCookie", name });
  }

  setHeader(name: string, value: string): DenoConnection<HeadersOpen> {
    return this.chain({ type: "setHeader", name, value });
  }

  setStatus(status: Status): DenoConnection<HeadersOpen> {
    return this.chain({ type: "setStatus", status });
  }

  setBody(body: unknown): DenoConnection<ResponseEnded> {
    if (typeof body !== "string") {
      throw new TypeError("DenoConnector only supports string body.");
    }
    return this.chain({ type: "setBody", body }, true);
  }

  endResponse(): DenoConnection<ResponseEnded> {
    return this.chain(endResponse, true);
  }
}

function run(action: Action, res: H.Response = {}): H.Response {
  switch (action.type) {
    case "clearCookie":
      H.deleteCookie(res, action.name);
      return res;
    case "endResponse":
      return res;
    case "setBody":
      res.body = action.body;
      return res;
    case "setCookie":
      H.setCookie(
        res,
        action.cookie,
      );
      return res;
    case "setHeader":
      if (isNotNil(res.headers)) {
        res.headers.set(action.name, action.value);
      } else {
        res.headers = new Headers({ [action.name]: action.value });
      }
      return res;
    case "setStatus":
      res.status = action.status;
      return res;
  }
}

function exec<I, O, E>(
  middleware: Middleware<I, O, E, void>,
  req: ServerRequest,
  res: H.Response = {},
): Promise<void> {
  return execMiddleware(middleware, new DenoConnection<I>(req, res))().then(
    (e) =>
      pipe(
        e,
        E.fold(() => {}, (c) => {
          const { actions: list, res, ended } = c as DenoConnection<O>;
          const len = list.length;
          const actions = toArray(list);
          for (let i = 0; i < len; i++) {
            run(actions[i], res);
          }
          if (!ended) {
            console.warn("Middleware did not close request!");
          }
          req.respond(res);
        }),
      ),
  );
}

export const use = <I, O, E>(
  middleware: Middleware<I, O, E, void>,
) => (req: H.ServerRequest): Promise<void> => exec(middleware, req);
