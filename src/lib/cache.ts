:49:18.579 
23:49:18.579 
   	- incremental was set to true
23:49:18.579 
   	- include was updated to add '.next/types/**/*.ts'
23:49:18.579 
   	- plugins was updated to add { name: 'next' }
23:49:18.579 
23:49:21.061 
Failed to compile.
23:49:21.062 
23:49:21.062 
./src/app/api/user/rate/route.ts:2:37
23:49:21.062 
Type error: Module '"../../../../lib/cache"' has no exported member 'saveUser'.
23:49:21.063 
23:49:21.063 
  1 | import { NextRequest, NextResponse } from "next/server";
23:49:21.063 
> 2 | import { getMovie, getOrCreateUser, saveUser } from "../../../../lib/cache";
23:49:21.063 
    |                                     ^
23:49:21.064 
  3 | import { cosine } from "../../../../lib/embeddings";
23:49:21.064 
  4 |
23:49:21.064 
  5 | function addVec(a: number[], b: number[]) {
23:49:21.107 
Error: Command "npm run build" exited with 1
