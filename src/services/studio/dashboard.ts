import { db } from "@/db";
import { equipmentReservations, expenses, invoices, payments, studioCalendarEvents, studioContracts, studioEquipment, studioLeads, studioProjects, studioTasks } from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";

const scope = (ids:string[]|null) => ids === null ? undefined : ids.length ? inArray(studioProjects.projectId,ids) : sql`false`;
export async function getStudioDashboard(ids:string[]|null,includeFinance:boolean,actorId:string,unscoped:boolean){
 const now=new Date(),dayStart=new Date(now);dayStart.setUTCHours(0,0,0,0);const dayEnd=new Date(dayStart.getTime()+86400000),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const projectScope=scope(ids);
 const calendarScope=ids===null?undefined:or(projectScope,eq(studioCalendarEvents.ownerEmployeeId,actorId));
 const [today,tasks,projectRows,leadRows,attention,equipment]=await Promise.all([
  db.select({id:studioCalendarEvents.id,title:studioCalendarEvents.title,eventType:studioCalendarEvents.eventType,startTime:studioCalendarEvents.startTime,endTime:studioCalendarEvents.endTime,location:studioCalendarEvents.location,projectId:studioCalendarEvents.studioProjectId,projectTitle:studioProjects.title}).from(studioCalendarEvents).leftJoin(studioProjects,eq(studioCalendarEvents.studioProjectId,studioProjects.id)).where(and(gte(studioCalendarEvents.startTime,dayStart),lt(studioCalendarEvents.startTime,dayEnd),ne(studioCalendarEvents.status,'cancelled'),calendarScope)).orderBy(asc(studioCalendarEvents.startTime)),
  db.select({id:studioTasks.id,title:studioTasks.title,priority:studioTasks.priority,dueDate:studioTasks.dueDate,status:studioTasks.status,projectId:studioTasks.studioProjectId,projectTitle:studioProjects.title}).from(studioTasks).innerJoin(studioProjects,eq(studioTasks.studioProjectId,studioProjects.id)).where(and(inArray(studioTasks.status,['open','in_progress']),orScope(projectScope,studioProjects))).orderBy(asc(studioTasks.dueDate)).limit(40),
  db.select({id:studioProjects.id,title:studioProjects.title,status:studioProjects.status,eventDate:studioProjects.eventDate,totalContractValue:studioProjects.totalContractValue}).from(studioProjects).where(projectScope),
  db.select({stage:studioLeads.stage,count:sql<number>`count(*)::int`}).from(studioLeads).where(unscoped?undefined:eq(studioLeads.assignedEmployeeId,actorId)).groupBy(studioLeads.stage),
  db.select({unsigned:sql<number>`count(*) filter (where ${studioContracts.status} in ('draft','sent'))::int`}).from(studioContracts).innerJoin(studioProjects,eq(studioContracts.studioProjectId,studioProjects.id)).where(projectScope),
  db.select({reserved:sql<number>`count(*) filter (where ${equipmentReservations.status} in ('reserved','checked_out'))::int`,maintenance:sql<number>`count(*) filter (where ${studioEquipment.locationType}='maintenance' or ${studioEquipment.currentHealthStatus}='needs_service')::int`}).from(studioEquipment).leftJoin(equipmentReservations,eq(equipmentReservations.equipmentId,studioEquipment.id)),
 ]);
 const overdue=tasks.filter(x=>x.dueDate&&x.dueDate<now),urgent=tasks.filter(x=>x.priority==='urgent');
 let finance=null;if(includeFinance){
  const [invoiceRows,paymentRows,expenseRows]=await Promise.all([
   db.select({grandTotal:invoices.grandTotal,balanceDue:invoices.balanceDue,invoiceDate:invoices.invoiceDate}).from(invoices).innerJoin(studioProjects,eq(studioProjects.projectId,invoices.projectId)).where(and(eq(invoices.status,'issued'),projectScope)),
   db.select({amount:payments.amount,paidAt:payments.paymentDate}).from(payments).innerJoin(studioProjects,eq(studioProjects.projectId,payments.projectId)).where(and(eq(payments.status,'completed'),eq(payments.paymentType,'customer_receipt'),projectScope)),
   db.select({amount:expenses.amount,expenseDate:expenses.expenseDate}).from(expenses).innerJoin(studioProjects,eq(studioProjects.projectId,expenses.projectId)).where(and(eq(expenses.status,'posted'),projectScope)),
  ]);
  const contracted=invoiceRows.filter(x=>x.invoiceDate>=monthStart).reduce((sum,x)=>sum+Number(x.grandTotal),0),costs=expenseRows.filter(x=>x.expenseDate>=monthStart).reduce((sum,x)=>sum+Number(x.amount),0);
  finance={contracted,collected:paymentRows.filter(x=>x.paidAt>=monthStart).reduce((sum,x)=>sum+Number(x.amount),0),outstanding:invoiceRows.reduce((sum,x)=>sum+Number(x.balanceDue),0),costs,profit:contracted-costs};
 }
 return {today,attention:{urgent:urgent.slice(0,10),overdue:overdue.slice(0,10),unsigned:Number(attention[0]?.unsigned||0)},pipeline:Object.fromEntries(leadRows.map(x=>[x.stage,x.count])),projects:{total:projectRows.length,byStage:Object.fromEntries([...new Set(projectRows.map(x=>x.status))].map(status=>[status,projectRows.filter(x=>x.status===status).length])),upcoming:projectRows.filter(x=>x.eventDate>=now).sort((a,b)=>+a.eventDate-+b.eventDate).slice(0,8)},equipment:equipment[0]||{reserved:0,maintenance:0},finance};
}
// A left-joined row with no project is visible only for unscoped administrators.
function orScope(condition:ReturnType<typeof scope>,table:typeof studioProjects){return condition===undefined?undefined:condition;}
