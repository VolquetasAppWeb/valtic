import { PartialType } from "@nestjs/swagger";
import { CreateFleetOwnerDto } from "./create-fleet-owner.dto";

export class UpdateFleetOwnerDto extends PartialType(CreateFleetOwnerDto) {}
