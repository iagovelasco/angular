/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */


import {StaticSymbol} from '../aot/static_symbol';
import {CompileIdentifierMetadata} from '../compile_metadata';
import {isBlank} from '../facade/lang';

import {EmitterVisitorContext, OutputEmitter} from './abstract_emitter';
import {AbstractJsEmitterVisitor} from './abstract_js_emitter';
import * as o from './output_ast';
import {ImportResolver} from './path_util';

export class JavaScriptEmitter implements OutputEmitter {
  constructor(private _importResolver: ImportResolver) {}
  emitStatements(genFilePath: string, stmts: o.Statement[], exportedVars: string[]): string {
    const converter = new JsEmitterVisitor(genFilePath, this._importResolver);
    const ctx = EmitterVisitorContext.createRoot(exportedVars);
    converter.visitAllStatements(stmts, ctx);
    const srcParts: string[] = [];
    converter.importsWithPrefixes.forEach((prefix, importedFilePath) => {
      // Note: can't write the real word for import as it screws up system.js auto detection...
      srcParts.push(
          `var ${prefix} = req` +
          `uire('${this._importResolver.fileNameToModuleName(importedFilePath, genFilePath)}');`);
    });
    srcParts.push(ctx.toSource());
    return srcParts.join('\n');
  }
}

class JsEmitterVisitor extends AbstractJsEmitterVisitor {
  importsWithPrefixes = new Map<string, string>();

  constructor(private _genFilePath: string, private _importResolver: ImportResolver) { super(); }

  private _resolveStaticSymbol(value: CompileIdentifierMetadata): StaticSymbol {
    const reference = value.reference;
    if (!(reference instanceof StaticSymbol)) {
      throw new Error(`Internal error: unknown identifier ${JSON.stringify(value)}`);
    }
    return this._importResolver.getImportAs(reference) || reference;
  }

  visitExternalExpr(ast: o.ExternalExpr, ctx: EmitterVisitorContext): any {
    const {name, filePath} = this._resolveStaticSymbol(ast.value);
    if (filePath != this._genFilePath) {
      let prefix = this.importsWithPrefixes.get(filePath);
      if (isBlank(prefix)) {
        prefix = `import${this.importsWithPrefixes.size}`;
        this.importsWithPrefixes.set(filePath, prefix);
      }
      ctx.print(`${prefix}.`);
    }
    ctx.print(name);
    return null;
  }
  visitDeclareVarStmt(stmt: o.DeclareVarStmt, ctx: EmitterVisitorContext): any {
    super.visitDeclareVarStmt(stmt, ctx);
    if (ctx.isExportedVar(stmt.name)) {
      ctx.println(exportVar(stmt.name));
    }
    return null;
  }
  visitDeclareFunctionStmt(stmt: o.DeclareFunctionStmt, ctx: EmitterVisitorContext): any {
    super.visitDeclareFunctionStmt(stmt, ctx);
    if (ctx.isExportedVar(stmt.name)) {
      ctx.println(exportVar(stmt.name));
    }
    return null;
  }
  visitDeclareClassStmt(stmt: o.ClassStmt, ctx: EmitterVisitorContext): any {
    super.visitDeclareClassStmt(stmt, ctx);
    if (ctx.isExportedVar(stmt.name)) {
      ctx.println(exportVar(stmt.name));
    }
    return null;
  }
}

function exportVar(varName: string): string {
  return `Object.defineProperty(exports, '${varName}', { get: function() { return ${varName}; }});`;
}
