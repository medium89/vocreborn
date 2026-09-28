import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { QuizAdminController, QuizController } from "./quiz.controller";
import { QuizService } from "./quiz.service";
@Module({imports:[AuthModule,ChatModule],controllers:[QuizController,QuizAdminController],providers:[QuizService]})
export class QuizModule {}
