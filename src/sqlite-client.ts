import {ExecuteSqlMessage} from "./messages/execute-sql.message";
import {CreateDatabaseMessage} from "./messages/create-database.message";
import {SqliteMessageInterface} from "./interfaces/sqlite-message.interface";
import {SqliteMessageTypeEnum} from "./enums/sqlite-message-type.enum";
import {ExecuteSqlResultMessage} from "./messages/execute-sql-result.message";
import {CreateDatabaseResultMessage} from "./messages/create-database-result.message";

export class SqliteClient {
  private queuedPromises: {[hash in string]: {resolve: (...args) => void, reject: (...args) => void}} = {}

  private worker: Worker;

  constructor(private readonly filename: string, private readonly flags: string, private sqliteWorkerPath: string) {
  }

  public init() {
    this.worker = new Worker(this.sqliteWorkerPath, {
      type: "module", // You need module for the '@sqlite.org/sqlite-wasm' library.
    })
    this.worker.onmessage = this.messageReceived.bind(this);

    const createDatabaseMessage = new CreateDatabaseMessage(this.filename, this.flags);
    this.worker.postMessage(createDatabaseMessage);

    return new Promise<any>( (resolve, reject) => {
      this.queuedPromises[createDatabaseMessage.uniqueId] =  {
        resolve,
        reject,
      };
    });
  }

  private messageReceived(message: MessageEvent) {
    const sqliteMessage = message.data as SqliteMessageInterface;
    if(sqliteMessage.uniqueId !== undefined && this.queuedPromises.hasOwnProperty(sqliteMessage.uniqueId)) {
      const promise = this.queuedPromises[sqliteMessage.uniqueId];
      delete this.queuedPromises[sqliteMessage.uniqueId];

      switch (sqliteMessage.type) {
        case SqliteMessageTypeEnum.ExecuteSqlResult:
          const executeSqlResultMessage = sqliteMessage as ExecuteSqlResultMessage;

          if(executeSqlResultMessage.error) {
            return promise.reject(executeSqlResultMessage.error);
          }

          return promise.resolve(executeSqlResultMessage.result);
        case SqliteMessageTypeEnum.CreateDatabaseResult:
          const createDatabaseResultMessage = sqliteMessage as CreateDatabaseResultMessage;

          if(createDatabaseResultMessage.error) {
            return promise.reject(createDatabaseResultMessage.error);
          }

          return promise.resolve();
      }
    }
  }


  public executeSql(sqlStatement: string, bindParameters: (string|number)[] = []): Promise<any> {
    const executeSqlMessage = new ExecuteSqlMessage(sqlStatement, bindParameters);

    this.worker.postMessage(executeSqlMessage);

    return new Promise<any>( (resolve, reject) => {
      this.queuedPromises[executeSqlMessage.uniqueId] =  {
        resolve,
        reject,
      };
    });
  }
}
