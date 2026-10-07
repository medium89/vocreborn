import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, type QuizConfig, type QuizRound } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ChatGateway } from "../chat/chat.gateway";
import { ChatService } from "../chat/chat.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { answerText, dayKey, fitsWindow, hintPositions, mask, nextWindow, normalizeAnswer, parseDocument, QUIZ_USERNAME, validateWindows, type QuizWindow } from "./quiz.rules";

@Injectable()
export class QuizService implements OnModuleInit, OnModuleDestroy {
  private readonly logger=new Logger(QuizService.name);
  private timer?: NodeJS.Timeout;
  private running=false;
  private recovering=true;
  private initialization?: Promise<void>;
  private bot?: { id:string; displayName:string };
  constructor(private readonly prisma:PrismaService,private readonly chat:ChatService,private readonly gateway:ChatGateway){}
  get runtimeEnabled(){return process.env.TUSOVA_QUIZ_ENABLED==="true";}
  async onModuleInit(){
    if(!this.runtimeEnabled){await this.prisma.user.updateMany({where:{username:QUIZ_USERNAME,isBot:true},data:{status:"OFFLINE"}});return;}
    await this.ensure();
    this.timer=setInterval(()=>void this.tick().catch(()=>this.logger.warn("Не удалось обновить викторину; повторяем позже")),1000);
    this.timer.unref();
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  private admin(actor:AuthenticatedUser){if(actor.role!=="admin")throw new ForbiddenException("Викториной управляет только администратор");}
  private async ensure(){
    this.initialization??=(async()=>{
      await this.prisma.quizConfig.upsert({where:{id:"main"},create:{id:"main",excludedUserIds:[]},update:{}});
      const existing=await this.prisma.user.findUnique({where:{username:QUIZ_USERNAME}});
      if(existing&&!existing.isBot)throw new ConflictException("Служебное имя викторины занято несервисным аккаунтом");
      if(existing)this.bot=existing;
      if(!this.runtimeEnabled)return;
      const user=await this.prisma.user.upsert({where:{username:QUIZ_USERNAME},create:{username:QUIZ_USERNAME,displayName:"Сова Викторина",isBot:true,role:"USER",participantBadge:"QUIZ",avatarKey:"/bot-avatars/quiz.svg",avatarThumbKey:"/bot-avatars/quiz.svg",status:"OFFLINE"},update:{isBot:true,role:"USER",isDj:false,passwordHash:null,isGuest:false,deletedAt:null,avatarKey:"/bot-avatars/quiz.svg",avatarThumbKey:"/bot-avatars/quiz.svg"}});
      this.bot=user;
      if(await this.prisma.room.findUnique({where:{id:"main"}}))await this.prisma.roomMembership.upsert({where:{userId_roomId:{userId:user.id,roomId:"main"}},create:{userId:user.id,roomId:"main"},update:{}});
    })().catch(error=>{this.initialization=undefined;throw error;});
    await this.initialization;
  }
  private async lock(tx:Prisma.TransactionClient){await tx.$queryRaw`SELECT id FROM quiz_config WHERE id='main' FOR UPDATE`;return tx.quizConfig.findUniqueOrThrow({where:{id:"main"}});}
  private audit(tx:Prisma.TransactionClient,actor:AuthenticatedUser,action:string,details:Prisma.InputJsonObject){return tx.moderationAudit.create({data:{actorId:actor.id,action,details}});}
  async preview(actor:AuthenticatedUser,raw:unknown){this.admin(actor);await this.ensure();const doc=parseDocument(raw);const existing=await this.prisma.quizTheme.findUnique({where:{externalId:doc.id},include:{questions:true}});return {document:doc,existing:existing?{id:existing.id,title:existing.title,revision:existing.revision,questions:existing.questions.length}:null,changes:{added:doc.questions.filter(q=>!existing?.questions.some(old=>old.externalId===q.id)).length,removed:existing?.questions.filter(q=>!doc.questions.some(next=>next.id===q.externalId)).length??0,changed:doc.questions.filter(q=>existing?.questions.some(old=>old.externalId===q.id&&(old.question!==q.question||old.answer!==q.answer||JSON.stringify(old.acceptedAnswers)!==JSON.stringify(q.acceptedAnswers)))).length}};}
  async import(actor:AuthenticatedUser,raw:unknown,mode:"create"|"update"){
    this.admin(actor);await this.ensure();const doc=parseDocument(raw);
    return this.prisma.$transaction(async tx=>{
      await this.lock(tx);const existing=await tx.quizTheme.findUnique({where:{externalId:doc.id}});
      if(mode==="create"&&existing)throw new ConflictException("Тема уже существует. Выберите обновление либо измените id для новой темы");
      if(mode==="update"&&!existing)throw new BadRequestException("Нет темы для обновления");
      const theme=existing?await tx.quizTheme.update({where:{id:existing.id},data:{title:doc.theme,revision:{increment:1}}}):await tx.quizTheme.create({data:{externalId:doc.id,title:doc.theme}});
      for(const [position,q]of doc.questions.entries())await tx.quizQuestion.upsert({where:{themeId_externalId:{themeId:theme.id,externalId:q.id}},create:{themeId:theme.id,externalId:q.id,position,question:q.question,answer:q.answer,acceptedAnswers:q.acceptedAnswers},update:{position,question:q.question,answer:q.answer,acceptedAnswers:q.acceptedAnswers}});
      await tx.quizQuestion.deleteMany({where:{themeId:theme.id,externalId:{notIn:doc.questions.map(q=>q.id)}}});
      await this.audit(tx,actor,"QUIZ_IMPORT",{themeId:theme.id,revision:theme.revision,mode,questions:doc.questions.length});return theme;
    },{timeout:15000});
  }
  async export(actor:AuthenticatedUser,id:string){this.admin(actor);const theme=await this.prisma.quizTheme.findUniqueOrThrow({where:{id},include:{questions:{orderBy:{position:"asc"}}}});return {version:1,id:theme.externalId,theme:theme.title,questions:theme.questions.map(q=>({id:q.externalId,question:q.question,answer:q.answer,acceptedAnswers:q.acceptedAnswers}))};}
  async theme(actor:AuthenticatedUser,id:string,enabled?:boolean,remove=false){this.admin(actor);await this.ensure();return this.prisma.$transaction(async tx=>{await this.lock(tx);const theme=remove?await tx.quizTheme.delete({where:{id}}):await tx.quizTheme.update({where:{id},data:{enabled}});await this.audit(tx,actor,"QUIZ_THEME",{id,enabled:enabled??false,remove});return theme;});}
  async settings(actor:AuthenticatedUser,input:Record<string,unknown>){
    this.admin(actor);await this.ensure();
    const allowed=["enabled","timezone","windows","intervalSeconds","durationSeconds","hint1Seconds","hint2Seconds","hint3Seconds","reward","minOnline","dailyQuestions","dailyBudget","playerDailyWins","playerDailyCredits","noRepeatHours","randomOrder","recycle","excludedUserIds"];
    if(Object.keys(input).some(key=>!allowed.includes(key)))throw new BadRequestException("Неизвестная настройка викторины");
    await this.prisma.$transaction(async tx=>{
      const current=await this.lock(tx),next={...current,...input};
      for(const field of ["enabled","randomOrder","recycle"]){if(typeof next[field as keyof typeof next]!=="boolean")throw new BadRequestException(field+": ожидается true/false");}
      const bounds:Record<string,[number,number]>={intervalSeconds:[5,86400],durationSeconds:[10,600],hint1Seconds:[1,599],hint2Seconds:[2,599],hint3Seconds:[3,599],reward:[1,1000],minOnline:[1,1000],dailyQuestions:[1,10000],dailyBudget:[1,1000000],playerDailyWins:[1,1000],playerDailyCredits:[1,100000],noRepeatHours:[0,720]};
      for(const[field,[min,max]]of Object.entries(bounds)){const value=next[field as keyof typeof next];if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)throw new BadRequestException(field+": целое число "+min+"–"+max);}
      if(next.hint1Seconds>=next.hint2Seconds||next.hint2Seconds>=next.hint3Seconds||next.hint3Seconds>=next.durationSeconds)throw new BadRequestException("Подсказка 1 < подсказка 2 < подсказка 3 < конец раунда");
      if(next.reward>next.dailyBudget||next.reward>next.playerDailyCredits)throw new BadRequestException("Награда не должна превышать дневные бюджеты");
      if(typeof next.timezone!=="string"||next.timezone.length>64)throw new BadRequestException("Неверный часовой пояс");
      validateWindows(next.windows,next.timezone);
      if(!Array.isArray(next.excludedUserIds)||next.excludedUserIds.length>500||next.excludedUserIds.some(id=>typeof id!=="string"||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))throw new BadRequestException("Исключения: до 500 UUID аккаунтов");
      if(!next.enabled&&current.activeRoundId)await this.close(tx,current,"CANCELLED","Викторина выключена администратором");
      await tx.quizConfig.update({where:{id:"main"},data:{...input,nextAt:new Date(),lastReason:null} as Prisma.QuizConfigUpdateInput});await this.audit(tx,actor,"QUIZ_SETTINGS",input as Prisma.InputJsonObject);
    });return this.overview(actor);
  }
  async overview(actor:AuthenticatedUser,cursor?:string){this.admin(actor);await this.ensure();const config=await this.prisma.quizConfig.findUniqueOrThrow({where:{id:"main"}});const today=dayKey(new Date(),config.timezone);const [themes,active,history,ranking,imports]=await Promise.all([
    this.prisma.quizTheme.findMany({orderBy:{title:"asc"},include:{_count:{select:{questions:true}}}}),config.activeRoundId?this.prisma.quizRound.findUnique({where:{id:config.activeRoundId}}):null,
    this.prisma.quizRound.findMany({orderBy:[{startedAt:"desc"},{id:"desc"}],take:31,...(cursor?{cursor:{id:cursor},skip:1}:{})}),
    this.prisma.quizRound.groupBy({by:["winnerId","winnerName"],where:{dayKey:today,status:"WON"},_count:{_all:true},_sum:{reward:true},orderBy:{_sum:{reward:"desc"}},take:20}),
    this.prisma.moderationAudit.findMany({where:{action:"QUIZ_IMPORT"},orderBy:{createdAt:"desc"},take:20,select:{id:true,details:true,createdAt:true}})
  ]);return {runtimeEnabled:this.runtimeEnabled,config,themes,active,history:history.slice(0,30),nextCursor:history.length>30?history[29].id:null,ranking,imports};}
  async publicStatus(){await this.ensure();const config=await this.prisma.quizConfig.findUniqueOrThrow({where:{id:"main"}});const round=config.activeRoundId?await this.prisma.quizRound.findUnique({where:{id:config.activeRoundId}}):null;return {enabled:this.runtimeEnabled&&config.enabled&&!config.paused,nextAt:config.nextAt,timezone:config.timezone,attemptSeconds:2,playerDailyWins:config.playerDailyWins,playerDailyCredits:config.playerDailyCredits,active:round?{id:round.id,question:round.question,theme:round.themeTitle,reward:round.reward,endsAt:round.endsAt,mask:mask(round.answer,round.hintPositions,round.hintsSent)}:null};}
  private async publish(tx:Prisma.TransactionClient,round:QuizRound,kind:string,body:string,rewardUserId?:string,requestSuffix?:string){
    if(!this.bot)throw new ServiceUnavailableException("Включите TUSOVA_QUIZ_ENABLED");
    const message=await tx.message.create({data:{roomId:"main",authorId:this.bot.id,authorName:this.bot.displayName,body,quizKind:kind,quizRoundId:round.id,requestId:"quiz:"+round.id+":"+kind+(requestSuffix?":"+requestSuffix:"")}});
    await tx.quizPublication.create({data:{messageId:message.id,roundId:round.id,kind,rewardUserId}});
  }
  private async close(tx:Prisma.TransactionClient,config:QuizConfig,status:string,reason:string){
    if(!config.activeRoundId)return;const round=await tx.quizRound.findUniqueOrThrow({where:{id:config.activeRoundId}});
    if(round.status!=="ACTIVE")return;
    const completed=await tx.quizRound.update({where:{id:round.id},data:{status,finishedAt:new Date()}});
    await this.publish(tx,completed,status,reason+". Ответ: "+round.answer);
    await tx.quizConfig.update({where:{id:"main"},data:{activeRoundId:null,nextAt:new Date(Date.now()+config.intervalSeconds*1000)}});
  }
  private async begin(tx:Prisma.TransactionClient,config:QuizConfig,now:Date,force:boolean){
    if(config.activeRoundId)throw new ConflictException("Уже идёт вопрос");
    const windows=config.windows as unknown as QuizWindow[];
    if(!force&&!fitsWindow(now,config.durationSeconds,config.timezone,windows))throw new BadRequestException("Вне расписания или до закрытия окна осталось мало времени");
    const online=await tx.user.count({where:{isBot:false,isGuest:false,deletedAt:null,status:{in:["ONLINE","AWAY","DND"]},memberships:{some:{roomId:"main"}}}});
    if(online<config.minOnline)throw new BadRequestException("Недостаточно зарегистрированных участников онлайн");
    const day=dayKey(now,config.timezone),count=await tx.quizRound.count({where:{dayKey:day}}),budget=await tx.quizRound.aggregate({where:{dayKey:day,status:{in:["ACTIVE","WON"]}},_sum:{reward:true}});
    if(count>=config.dailyQuestions||(budget._sum.reward??0)+config.reward>config.dailyBudget)throw new BadRequestException("Дневной лимит вопросов или бюджет наград исчерпан");
    const candidates=await tx.quizQuestion.findMany({where:{theme:{enabled:true},...(config.recycle?{}:{askedCount:0}),OR:[{lastAskedAt:null},{lastAskedAt:{lte:new Date(now.getTime()-config.noRepeatHours*3600000)}}]},include:{theme:true},orderBy:[{askedCount:"asc"},{themeId:"asc"},{position:"asc"}],take:7000});
    if(!candidates.length)throw new BadRequestException("Нет вопросов: включите тему или дождитесь периода повторения");
    const minimum=candidates[0].askedCount,pool=candidates.filter(q=>q.askedCount===minimum),question=config.randomOrder?pool[Math.floor(Math.random()*pool.length)]:pool[0];
    const round=await tx.quizRound.create({data:{id:randomUUID(),themeId:question.themeId,questionId:question.id,themeTitle:question.theme.title,revision:question.theme.revision,question:question.question,answer:question.answer,acceptedAnswers:[question.answer,...question.acceptedAnswers].map(normalizeAnswer),hintPositions:hintPositions(question.answer),hint1At:new Date(now.getTime()+config.hint1Seconds*1000),hint2At:new Date(now.getTime()+config.hint2Seconds*1000),hint3At:new Date(now.getTime()+config.hint3Seconds*1000),startedAt:now,endsAt:new Date(now.getTime()+config.durationSeconds*1000),dayKey:day,reward:config.reward,playerDailyWins:config.playerDailyWins,playerDailyCredits:config.playerDailyCredits,cursorAt:now}});
    await tx.quizQuestion.update({where:{id:question.id},data:{askedCount:{increment:1},lastAskedAt:now}});
    await tx.quizConfig.update({where:{id:"main"},data:{activeRoundId:round.id,nextAt:null,lastReason:null}});
    await this.publish(tx,round,"QUESTION","Тема · "+round.themeTitle+"\n"+round.question+((count%5===0)?"\nВикторина мешает? В меню ⋯ выберите «Скрыть сообщения викторины».":""));return round;
  }
  async command(actor:AuthenticatedUser,action:string,confirmed=false){
    this.admin(actor);if(!this.runtimeEnabled)throw new ServiceUnavailableException("Включите TUSOVA_QUIZ_ENABLED и перезапустите API");await this.ensure();
    await this.prisma.$transaction(async tx=>{
      const config=await this.lock(tx);
      if(action==="pause"){await this.close(tx,config,"CANCELLED","Викторина на паузе");await tx.quizConfig.update({where:{id:"main"},data:{paused:true}});}
      else if(action==="resume")await tx.quizConfig.update({where:{id:"main"},data:{paused:false,enabled:true,nextAt:new Date()}});
      else if(action==="skip"||action==="finish")await this.close(tx,config,"CANCELLED",action==="skip"?"Вопрос пропущен администратором":"Раунд завершён администратором");
      else if(action==="start"){if(!config.enabled||config.paused)throw new BadRequestException("Сначала включите/продолжите викторину");await this.begin(tx,config,new Date(),confirmed);}
      await this.audit(tx,actor,"QUIZ_CONTROL",{action,confirmed});
    },{timeout:15000});await this.flush();return this.overview(actor);
  }
  private async answers(tx:Prisma.TransactionClient,config:QuizConfig,round:QuizRound){
    const messages=await tx.message.findMany({where:{roomId:"main",deletedAt:null,quizKind:null,editedAt:null,createdAt:{gte:round.startedAt,lt:round.endsAt},quizAcceptedAt:{gte:round.startedAt,lt:round.endsAt},author:{isBot:false,deletedAt:null},OR:[{quizAcceptedAt:{gt:round.cursorAt}},...(round.cursorId?[{quizAcceptedAt:round.cursorAt,id:{gt:round.cursorId}}]:[{quizAcceptedAt:round.cursorAt}])]},orderBy:[{quizAcceptedAt:"asc"},{id:"asc"}],take:100,include:{author:true}});
    let last:typeof messages[number]|undefined;
    for(const message of messages){
      last=message;const user=message.author!;if(config.excludedUserIds.includes(user.id))continue;
      const previous=await tx.quizAttempt.findUnique({where:{roundId_userId:{roundId:round.id,userId:user.id}}});
      if(previous&&message.quizAcceptedAt!.getTime()-previous.lastAt.getTime()<2000)continue;
      await tx.quizAttempt.upsert({where:{roundId_userId:{roundId:round.id,userId:user.id}},create:{roundId:round.id,userId:user.id,lastAt:message.quizAcceptedAt!},update:{lastAt:message.quizAcceptedAt!}});
      if(!round.acceptedAnswers.includes(answerText(message.body)))continue;
      if(user.isGuest){await this.publish(tx,round,"GUEST_RIGHT","@"+user.username+", вы ответили верно, но Сова не может засчитать ответ: регистрация в чате ещё не пройдена. Пожалуйста, зарегистрируйтесь.",undefined,message.id);continue;}
      const blocked=await tx.user.findFirst({where:{id:user.id,OR:[{mutes:{some:{expiresAt:{gt:new Date()}}}},{chaos:{some:{revokedAt:null,expiresAt:{gt:new Date()}}}},{bans:{some:{revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}}]},select:{id:true}});if(blocked)continue;
      const stats=await tx.quizRound.aggregate({where:{winnerId:user.id,dayKey:round.dayKey,status:"WON"},_count:{_all:true},_sum:{reward:true}});
      if(stats._count._all>=round.playerDailyWins||(stats._sum.reward??0)+round.reward>round.playerDailyCredits||user.credits>2147483647-round.reward)continue;
      const won=await tx.quizRound.update({where:{id:round.id},data:{status:"WON",winnerId:user.id,winnerName:user.displayName,winningMessageId:message.id,finishedAt:new Date()}});
      const balance=await tx.user.update({where:{id:user.id},data:{credits:{increment:round.reward}},select:{credits:true}});
      await tx.economyEntry.create({data:{userId:user.id,type:"QUIZ_REWARD",creditsDelta:round.reward,balanceAfter:balance.credits,referenceKey:"quiz:"+round.id}});
      await this.publish(tx,won,"WON","@"+user.username+", верно! Ответ: "+round.answer+". Вы получили "+round.reward+" кредитов.",user.id);
      await tx.quizConfig.update({where:{id:"main"},data:{activeRoundId:null,nextAt:new Date(Date.now()+config.intervalSeconds*1000)}});return true;
    }
    if(last)await tx.quizRound.update({where:{id:round.id},data:{cursorAt:last.quizAcceptedAt!,cursorId:last.id}});
    // Drain already accepted answers before timing out, even in a busy room.
    return messages.length===100;
  }
  private async tick(){
    if(this.running||!this.runtimeEnabled)return;this.running=true;
    try{
      await this.ensure();await this.prisma.$transaction(async tx=>{
        const config=await this.lock(tx),now=new Date();
        if(config.activeRoundId){
          const round=await tx.quizRound.findUniqueOrThrow({where:{id:config.activeRoundId}});
          if(!config.enabled||config.paused){await this.close(tx,config,"CANCELLED","Викторина остановлена");return;}
          if(this.recovering&&round.endsAt<=now){await this.close(tx,config,"TIMEOUT","Время истекло во время перезапуска. Никто не угадал");return;}
          if(await this.answers(tx,config,round))return;
          if(round.endsAt<=now){await this.close(tx,config,"TIMEOUT","Время вышло. Никто не угадал");return;}
          const target=now>=round.hint3At?3:now>=round.hint2At?2:now>=round.hint1At?1:0;
          if(target>round.hintsSent){await tx.quizRound.update({where:{id:round.id},data:{hintsSent:target}});await this.publish(tx,round,"HINT"+target,"Подсказка "+target+"/3: "+mask(round.answer,round.hintPositions,target));}
        }else if(config.enabled&&!config.paused&&(!config.nextAt||config.nextAt<=now)){
          const next=nextWindow(now,config.durationSeconds,config.timezone,config.windows as unknown as QuizWindow[]);
          if(!next||next>now){await tx.quizConfig.update({where:{id:"main"},data:{nextAt:next??new Date(now.getTime()+3600000),lastReason:"Вне рабочего окна"}});return;}
          // Preflight cannot mutate before rejecting; savepoint isolates begin errors.
          await tx.$executeRawUnsafe("SAVEPOINT quiz_begin");
          try{await this.begin(tx,config,now,false);}catch(error){await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT quiz_begin");if(!(error instanceof BadRequestException))throw error;await tx.quizConfig.update({where:{id:"main"},data:{nextAt:new Date(now.getTime()+15000),lastReason:String(error.message).slice(0,200)}});}
        }
      },{timeout:15000});this.recovering=false;
      const config=await this.prisma.quizConfig.findUniqueOrThrow({where:{id:"main"}}),online=config.enabled&&!config.paused&&fitsWindow(new Date(),1,config.timezone,config.windows as unknown as QuizWindow[]);
      const presence=await this.prisma.user.updateMany({where:{id:this.bot!.id,status:{not:online?"ONLINE":"OFFLINE"}},data:{status:online?"ONLINE":"OFFLINE"}});
      if(presence.count)this.gateway.emitBotPresence(this.bot!.id,online?"online":"offline");
      await this.flush();
    }finally{this.running=false;}
  }
  private async flush(){
    const rows=await this.prisma.quizPublication.findMany({where:{deliveredAt:null},orderBy:{createdAt:"asc"},take:20});
    for(const row of rows)await this.prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw<{message_id:string}[]>`SELECT message_id FROM quiz_publications WHERE message_id=${row.messageId}::uuid AND delivered_at IS NULL FOR UPDATE SKIP LOCKED`;
      if(!locked.length)return;
      const round=await tx.quizRound.findUnique({where:{id:row.roundId}});
      if((row.kind==="QUESTION"||row.kind.startsWith("HINT"))&&(!round||round.status!=="ACTIVE"||round.endsAt<=new Date())){await tx.quizPublication.update({where:{messageId:row.messageId},data:{deliveredAt:new Date()}});return;}
      const message=await this.chat.getRoomMessage("main",row.messageId,this.bot!.id).catch(error=>{if(error instanceof NotFoundException)return null;throw error;});
      if(message){this.gateway.emitRoomMessage("main",message);if(row.rewardUserId)this.gateway.emitEconomyChanged(row.rewardUserId);}
      await tx.quizPublication.update({where:{messageId:row.messageId},data:{deliveredAt:new Date()}});
    });
  }
}
