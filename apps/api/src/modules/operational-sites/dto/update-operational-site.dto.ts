import { PartialType } from "@nestjs/swagger";
import { CreateOperationalSiteDto } from "./create-operational-site.dto";

export class UpdateOperationalSiteDto extends PartialType(CreateOperationalSiteDto) {}
